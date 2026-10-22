"""Backend checks. Run from backend/: .venv/bin/python test_backend.py

Needs the Postgres from .env (it writes and deletes one test row). No network calls:
Groq and Whisper are replaced with fakes.
"""
from types import SimpleNamespace

from fastapi.testclient import TestClient

import cache_db
import main
from services import transcription, video_service
from services.transcription import UnsupportedLanguage, VideoTooLong, transcribe
from services.utils import fit_transcript


class FakeWhisper:
    """Detects `language`; transcribing gives `text`, translating gives `translated`."""
    def __init__(self, language, text="", translated="", duration=60):
        self.language, self.text, self.translated, self.duration = language, text, translated, duration
        self.tasks = []

    def transcribe(self, path, task="transcribe", language=None):
        self.tasks.append(task)
        out = self.translated if task == "translate" else self.text
        segs = [SimpleNamespace(text=w) for w in out.split()]
        return iter(segs), SimpleNamespace(language=self.language, language_probability=0.9, duration=self.duration)


def check(name, cond):
    assert cond, name
    print("ok ", name)


def test_transcription():
    m = FakeWhisper("en", text="hello world")
    check("english is transcribed, not translated", transcribe(m, "a.mp3") == "hello world" and m.tasks == ["transcribe"])

    m = FakeWhisper("hi", translated="word " * 40)
    check("non-English is translated to English", transcribe(m, "a.mp3").split() == ["word"] * 40 and m.tasks[-1] == "translate")

    for model, exc, name in [
        (FakeWhisper("ja", translated="too short"), UnsupportedLanguage, "failed translation raises UnsupportedLanguage"),
        (FakeWhisper("en", duration=transcription.MAX_VIDEO_MINUTES * 60 + 1), VideoTooLong, "long video raises VideoTooLong"),
    ]:
        try:
            transcribe(model, "a.mp3")
            check(name, False)
        except exc as e:
            check(name, "Japanese" in str(e) if exc is UnsupportedLanguage else True)


def test_fit_transcript():
    check("short transcript is unchanged", fit_transcript("abc", 100) == "abc")
    long = "".join(str(i % 10) for i in range(50000))
    fitted = fit_transcript(long, 12000)
    check("long transcript fits the cap", len(fitted) <= 12000 + 5 * len(" [...] "))
    check("excerpts reach the end of the video", fitted.endswith(long[-100:]))


def test_pool_waits():
    import threading
    errors = []
    def hold():
        try:
            with cache_db.db() as cur:
                cur.execute("SELECT pg_sleep(0.2)")
        except Exception as e:
            errors.append(e)
    threads = [threading.Thread(target=hold) for _ in range(cache_db.MAX_CONNECTIONS * 3)]
    for t in threads: t.start()
    for t in threads: t.join()
    check("more callers than connections wait instead of failing", not errors)


def test_llm_topics():
    def fake_client(content):
        msg = SimpleNamespace(content=content)
        create = lambda **_: SimpleNamespace(choices=[SimpleNamespace(message=msg)])
        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    real = video_service.groq_client
    try:
        video_service.groq_client = fake_client(
            '{"topics": [{"topic": "Diodes", "detailed_points": ["A diode conducts one way.", " "]},'
            ' {"topic": "", "detailed_points": ["no title"]}, "junk"]}'
        )
        check("llm topics keep valid entries and drop blanks",
              video_service.llm_topics("t") == [{"topic": "Diodes", "detailed_points": ["A diode conducts one way."]}])
        video_service.groq_client = fake_client("not json")
        check("bad LLM output returns None (caller falls back)", video_service.llm_topics("t") is None)
    finally:
        video_service.groq_client = real


def test_cache():
    vid = "__test_video__"
    try:
        cache_db.save_video(vid, "transcript", "summary", [{"topic": "T", "detailed_points": ["p"]}], b"\x00" * 8)
        got = cache_db.get_cached_video(vid)
        check("saved video reads back", got and got["summary"] == "summary" and got["topics"][0]["topic"] == "T")
        check("embeddings stay out of the API result", "embeddings" not in got)

        cache_db.save_generated(vid, "quiz", [{"id": 1}])
        check("generated quiz is cached", cache_db.get_generated(vid, "quiz") == [{"id": 1}])
        cache_db.save_video(vid, "new transcript", "summary")
        check("re-analysis clears the cached quiz", cache_db.get_generated(vid, "quiz") is None)

        with cache_db.db() as cur:
            cur.execute("UPDATE videos SET expires_at = '2000-01-01' WHERE video_id = %s", (vid,))
        check("expired video is a cache miss", cache_db.get_cached_video(vid) is None)
    finally:
        cache_db.delete_video(vid)


def test_api():
    c = TestClient(main.app)
    check("/health", c.get("/health").json() == {"status": "ok"})
    check("/docs is off by default", c.get("/docs").status_code == 404)
    check("chat on an unknown video is a 404", c.get("/query", params={"query": "q", "video_id": "nope"}).status_code == 404)


if __name__ == "__main__":
    test_transcription()
    test_fit_transcript()
    test_pool_waits()
    test_llm_topics()
    test_cache()
    test_api()
    print("all backend checks passed")
