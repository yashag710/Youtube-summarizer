import os
import re
import subprocess
import uuid


# Groq's free tier allows 8k tokens per minute for gpt-oss-120b, counting the prompt plus
# max_tokens. 9k chars of transcript measured at up to ~3.3k prompt tokens for the quiz
# (translated text tokenizes denser), which with its 3k max_tokens leaves room to spare.
LLM_TRANSCRIPT_CHARS = 9000


def fit_transcript(transcript: str, max_chars: int = LLM_TRANSCRIPT_CHARS) -> str:
    """The transcript if it fits, else evenly spaced excerpts so the whole video is covered."""
    if len(transcript) <= max_chars:
        return transcript
    parts = 6
    size = max_chars // parts
    step = (len(transcript) - size) // (parts - 1)
    return " [...] ".join(transcript[i * step:i * step + size] for i in range(parts))


def extract_video_id(url: str) -> str:
    """
    Extract the YouTube video ID from different URL formats
    """
    match = re.search(
        r"(?:v=|youtu\.be/|youtube\.com/(?:shorts|embed|live)/)([A-Za-z0-9_-]{11})",
        url,
    )

    if not match:
        raise ValueError("Invalid YouTube URL")

    return match.group(1)


def clean_video_url(url: str) -> str:
    """
    Convert any YouTube URL to a clean watch URL
    """
    video_id = extract_video_id(url)
    return f"https://www.youtube.com/watch?v={video_id}"


def _extract_error_tail(process_result: subprocess.CompletedProcess) -> str:
    # yt-dlp's reasons are its "ERROR:" lines; stdout is mostly download progress
    stderr = (process_result.stderr or "").strip()
    errors = [
        re.sub(r";? *please report this issue on .*", "", line)  # drop yt-dlp's bug-report boilerplate
        for line in stderr.splitlines() if line.startswith("ERROR")
    ]
    if errors:
        return "\n".join(errors)[:500]  # the start of an ERROR line holds the reason
    return stderr[-500:] if stderr else f"exited with code {process_result.returncode} without producing audio"


def _build_yt_dlp_strategies(output_template: str, video_url: str) -> list[tuple[str, list[str]]]:
    base = [
        "yt-dlp",
        "--no-playlist",
        # Solve YouTube's JS challenge with Node (yt-dlp needs Node 22+)
        "--js-runtimes", "node",
        "--remote-components", "ejs:github",
        # No --extractor-args player_client=web: without cookies that client returns no
        # formats; yt-dlp's default clients work anonymously
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--retries", "5",
        "--fragment-retries", "5",
        "--concurrent-fragments", "1",
        "-f", "bestaudio[ext=m4a]/bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "-o", output_template,
        video_url,
    ]

    strategies: list[tuple[str, list[str]]] = []

    # Rotating residential proxy, if configured. No cookies: a residential IP already
    # passes YouTube's bot check, and one account across many IPs looks suspicious.
    # "{session}" in the URL gets a fresh id per download, so the provider keeps one IP
    # for the whole download (YouTube's media URLs only work from the IP that got them).
    proxy = os.getenv("YTDLP_PROXY")
    if proxy:
        proxy = proxy.replace("{session}", uuid.uuid4().hex[:12])
        strategies.append(("proxy", [*base, "--proxy", proxy]))

    # Direct connection: what local development uses (a home IP is already residential)
    strategies.append(("direct", base))

    # Direct with HLS formats, for videos that only offer those
    hls_fallback = [*base]
    format_idx = hls_fallback.index("-f")
    hls_fallback[format_idx + 1] = "91/92/93/94/140/139/bestaudio/best"
    strategies.append(("direct-hls", hls_fallback))

    return strategies

def _download_with_yt_dlp(video_url: str, output_path: str):

    output_path = os.path.abspath(output_path)
    output_dir = os.path.dirname(output_path)
    # This ensures we have a clean filename without extension for the template
    output_name = os.path.splitext(os.path.basename(output_path))[0]
    os.makedirs(output_dir, exist_ok=True)

    # Use a simpler template to avoid confusion
    output_template = os.path.join(output_dir, f"{output_name}.%(ext)s")

    strategies = _build_yt_dlp_strategies(output_template, video_url)
    strategy_errors: list[str] = []
    timeout = int(os.getenv("YTDLP_TIMEOUT_SECONDS", "1200"))

    for name, command in strategies:
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            strategy_errors.append(f"{name}: timed out after {timeout}s")
            continue

        # Check if the expected MP3 exists now
        expected_mp3 = os.path.join(output_dir, f"{output_name}.mp3")

        if os.path.exists(expected_mp3):
            # If it exists but isn't named exactly what output_path wants, rename it
            if expected_mp3 != output_path:
                os.replace(expected_mp3, output_path)
            return  # SUCCESS! Exit the function

        strategy_errors.append(f"{name}: {_extract_error_tail(result)}")

    raise RuntimeError("yt-dlp failed with every strategy:\n" + "\n".join(strategy_errors))


def download_audio(video_url: str, output_path: str):
    """
    Download audio from YouTube using yt-dlp
    """
    video_url = clean_video_url(video_url)
    output_path = os.path.abspath(output_path)

    try:
        _download_with_yt_dlp(video_url, output_path)
        return
    except Exception as error:
        print("yt-dlp download failed:", error)
        raise RuntimeError(f"Failed to download audio from YouTube: {error}") from error


_OPTION_LABEL = re.compile(r"^\s*\(?[A-Da-d][).:\-]\s*")
_ANSWER_LETTER = re.compile(r"^\(?([A-Da-d])(?:[).:\-]|\s|$)")


def normalize_mcq(question: dict) -> dict | None:
    """
    Convert an LLM multiple-choice question to plain-text options + 0-based correct_index.
    Returns None if the question can't be repaired.
    """
    raw = [str(o).strip() for o in question.get("options") or []]
    # Strip "A) " style labels only when every option has one, so "A. Lincoln" survives
    if raw and all(_OPTION_LABEL.match(o) for o in raw):
        options = [_OPTION_LABEL.sub("", o).strip() for o in raw]
    else:
        options = raw
    if len(options) != 4:
        return None

    idx = question.get("correct_index")
    if isinstance(idx, str) and idx.strip().isdigit():
        idx = int(idx)
    if not isinstance(idx, int) or isinstance(idx, bool):
        answer = str(question.get("correct_answer", "")).strip()
        lowered = [o.lower() for o in options]
        if answer.lower() in lowered:  # plain text: "Rome"
            idx = lowered.index(answer.lower())
        elif m := _ANSWER_LETTER.match(answer):  # "B", "B)", "B. Rome", "(b) Rome"
            idx = ord(m.group(1).upper()) - ord("A")
        else:
            idx = -1
    if not 0 <= idx < 4:
        return None

    cleaned = {k: v for k, v in question.items() if k != "correct_answer"}
    return {**cleaned, "options": options, "correct_index": idx}


if __name__ == "__main__":
    labelled = ["A) Paris", "B) Rome", "C) Berlin", "D) Madrid"]
    for answer in ["B", "b", "B)", "B. Rome", "(b) Rome", "Rome", "B) Rome"]:
        q = normalize_mcq({"options": labelled, "correct_answer": answer})
        assert q and q["correct_index"] == 1 and q["options"][1] == "Rome", answer
        assert "correct_answer" not in q
    plain = ["Paris", "Rome", "Berlin", "Madrid"]
    assert normalize_mcq({"options": plain, "correct_index": 2})["correct_index"] == 2
    assert normalize_mcq({"options": plain, "correct_index": "3"})["correct_index"] == 3
    lincoln = normalize_mcq({"options": ["A. Lincoln", "Grant", "Lee", "Davis"], "correct_answer": "A. Lincoln"})
    assert lincoln["options"][0] == "A. Lincoln" and lincoln["correct_index"] == 0
    assert normalize_mcq({"options": plain[:3], "correct_index": 0}) is None
    assert normalize_mcq({"options": labelled, "correct_answer": "Tokyo"}) is None
    assert normalize_mcq({"options": plain, "correct_index": 7}) is None
    assert normalize_mcq({"options": plain, "correct_index": True, "correct_answer": "Rome"})["correct_index"] == 1
    print("normalize_mcq ok")

    os.environ.pop("YTDLP_PROXY", None)
    names = [n for n, _ in _build_yt_dlp_strategies("out.%(ext)s", "URL")]
    assert names == ["direct", "direct-hls"], names
    os.environ["YTDLP_PROXY"] = "http://user-session-{session}:pw@gw:7000"
    s1, s2 = _build_yt_dlp_strategies("o", "U"), _build_yt_dlp_strategies("o", "U")
    assert [n for n, _ in s1] == ["proxy", "direct", "direct-hls"]
    p1, p2 = s1[0][1][s1[0][1].index("--proxy") + 1], s2[0][1][s2[0][1].index("--proxy") + 1]
    assert "{session}" not in p1 and p1 != p2, (p1, p2)  # fresh sticky session per download
    assert all("--proxy" not in cmd for n, cmd in s1 if n != "proxy")
    assert not any("cookie" in arg for _, cmd in s1 for arg in cmd)
    os.environ.pop("YTDLP_PROXY")

    fake = lambda err, code=1: subprocess.CompletedProcess([], code, stdout="[download] 50%", stderr=err)
    assert _extract_error_tail(fake("WARNING: x\nERROR: [youtube] abc: Video unavailable")) == "ERROR: [youtube] abc: Video unavailable"
    assert _extract_error_tail(fake("ERROR: [youtube] abc: No video formats found!; please report this issue on  https://x , filling out")) == "ERROR: [youtube] abc: No video formats found!"
    assert _extract_error_tail(fake("something odd")) == "something odd"
    assert "code 0" in _extract_error_tail(fake("", 0))
    print("yt-dlp strategies ok")
