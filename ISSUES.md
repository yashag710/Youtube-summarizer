# Known Issues

Issues found during a full read of the codebase, ordered by severity. Nothing here has been fixed or reproduced yet; each item is based on reading the code.

- Frontend paths are relative to `frontend/src/app/`; backend paths are relative to `backend/`.
- 🆕 marks issues found in the second, more detailed pass.

---

## 🔴 Critical: core features broken, or a security problem

1. **Quiz scoring is always 0 for multiple choice.**
   - `qna/page.tsx:393-394` stores the option letter (`"B"`).
   - `getScore` and `isCorrect` (`:160`, `:175`) compare that letter with `correct_answer`, which is `"B) option2"`, so they never match.
   - The answer highlighting uses `charAt(0)`, so the colours look right while the score is wrong.

2. **A cache hit sends Q&A, notes and chat to the wrong video.**
   - `cache_db.py:91-94` returns `{transcript, summary, topics}` with no `video_id`.
   - `content/page.tsx:93` only saves `video_id` when it is present, so the previous video's ID stays in localStorage.
   - Fresh and cached responses also have different shapes: only the cached one includes the transcript.

3. **The token gating does nothing, and paid endpoints have no rate limit.**
   - `/generate_token` (`main.py:93`) has no auth, so anyone can mint a step-2 token.
   - `/analyze` reads the token's `video_id` and never uses it (`main.py:38`).
   - `/notes` and `/query` have no auth at all.
   - 🆕 Nothing limits request rates, so anyone can repeatedly trigger Groq calls on your API key, and video downloads/transcription that tie up CPU.

4. **The chatbot shares global state.**
   - `/query` rebuilds the FAISS index on every request and stores it in module globals (`main.py:82-88`, `chatbot/rag.py:11-17`).
   - Two users or videos at once will get each other's context.
   - It also re-embeds the whole transcript for every question.

5. **yt-dlp won't work in Docker as written.**
   - Every strategy uses `--cookies-from-browser=brave` (`services/utils.py:42,54`), and the container has no browser.
   - The README's `YTDLP_COOKIES_FILE` is never read.
   - `strategy_errors` is collected but never shown (`services/utils.py:119-121`), so every failure just says "file not found".

6. 🆕 **Cookies get copied into the Docker image.** `.dockerignore` excludes `.env` but not `youtube_cookies.txt`, so `COPY . .` (`Dockerfile:33`) puts your YouTube session cookies into the image.

---

## 🟠 High: wrong or misleading results for real users

7. **The summary covers only a small part of the video.**
   - `rewrite_offline` summarises only the first 3 chunks of 1,024 characters each (`services/summarizer.py:27`).
   - Topics are fixed word-count slices of the transcript, not real topics (`services/video_service.py:106-117`).

8. **Errors are hidden instead of shown.**
   - The notes page never sets `error` (`notes/page.tsx:69-72`), so a failure shows an empty page.
   - Q&A returns `{"error": ...}` with HTTP 200 (`services/qna_service.py:22,95`), and `json.loads` (`:97`) can throw a 500.
   - `save_video` failures are swallowed by a bare `except` (`services/video_service.py:75-78`).

9. **The landing page extracts the video ID differently from the backend.**
   - `page.tsx:67-68` only handles `watch?v=` and `youtu.be`, so a `/shorts/` link sends `video_id=null`.
   - The backend's `extract_video_id` handles more formats.

10. 🆕 **Long videos always time out on the frontend.**
    - The axios timeout is 5 minutes (`content/page.tsx:81`), and the retry logic then calls `/analyze` again.
    - Meanwhile the backend is still working: downloading, transcribing and running BART takes longer than 5 minutes for long videos.
    - There is no limit on video duration.

11. 🆕 **Transcription assumes English** (`services/transcription.py:2`, `language="en"`). Non-English videos produce garbage transcripts.

12. 🆕 **The per-video lock has a race.** `finally` deletes the lock from the dict while other requests may still be waiting on it (`services/video_service.py:84-87`). A request arriving next creates a fresh lock, so the same video can be processed twice. The lock also only works within one process.

13. 🆕 **Notes export is invisible on mobile and tablet.** The whole export panel is `hidden lg:block` (`notes/page.tsx:308`), so small screens can't download or copy notes.

14. 🆕 **PDF export cuts off long sections.**
    - Each page scrolls internally (`notes/components/canvas.tsx:220`), and html2canvas only captures the visible part.
    - The image height is then capped at one A4 page (`notes/page.tsx:186`).

---

## 🟡 Medium: quality, cost, robustness

15. 🆕 **The chatbot is told to use outside knowledge.** The prompt says "answer using your own knowledge" (`chatbot/llm.py:13`), so it confidently answers off-topic questions. The `< 50` character context check (`chatbot/pipeline.py:8`) never fires, because search always returns chunks once an index exists.

16. 🆕 **Short videos give the chatbot duplicate context.** When there are fewer than 3 chunks, FAISS returns `-1` IDs, and `chunks[-1]` silently repeats the last chunk (`chatbot/rag.py:24-26`).

17. 🆕 **Quiz questions come from the BART summary only** (`services/qna_service.py:78`). Twenty questions from a few hundred words encourages invented questions. The transcript is available and isn't used.

18. 🆕 **Notes and quizzes are regenerated on every visit.** Nothing is cached, so each visit costs another Groq call and gives different content.

19. 🆕 **Raw exception text is returned to the client** (`main.py:51`).

20. **Three heavy models load at import time:** Whisper, BART-large-cnn and MiniLM (`services/video_service.py:14`, `services/summarizer.py:6`, `chatbot/rag.py:5`). Startup is slow and memory use is high.

21. **Long work blocks worker threads and there is no job queue.** Sync endpoints hold a threadpool worker for minutes per video.

22. 🆕 **The Node version in Docker is likely too old.** `Dockerfile:19` installs `nodejs` from Debian apt, which is likely too old for yt-dlp's JS challenge solver. `--remote-components ejs:github` (`services/utils.py:51`) also downloads and runs code from GitHub at runtime.

23. **`cache_db.py:13` crashes at import if `DB_PORT` is unset.**

24. **Dependency problems.**
    - `requirements.txt` has both `openai-whisper` (unused) and `faster-whisper`.
    - Nothing is pinned, which matters most for `torch` and `transformers`.
    - Newer nltk needs `punkt_tab`, not `punkt` (`services/summarizer.py:80-82`, `Dockerfile:30`).

25. **CORS is hardcoded to `localhost:3000`** (`main.py:20`), so any deployment needs a code change.

---

## ⚪ Low: leftovers and cleanup

26. **`backend/cache.db`** is a committed, unused SQLite file from an earlier version.

27. **`youtube_cookies.txt` is not gitignored.** Compose mounts it (`docker-compose.yml:47`), so if the file is missing Docker creates a directory in its place.

28. **`datetime.utcnow()` is deprecated** (`cache_db.py:83,113,150`).

29. 🆕 **Database inefficiencies.**
    - The index `idx_video_id` duplicates the primary key's index (`cache_db.py:48-50`).
    - Every DB call opens a new connection, and one cache read opens 2–3.

30. 🆕 **Unused imports and dead code.**
    - Imports: `Body` and a duplicate `FastAPI` in `main.py`; `verify_flow_token` and `re` in `services/notes_service.py`; `glob` in `services/utils.py`; `re`, `subprocess`, `sys`, `time` in `services/video_service.py`.
    - `generate_topics_offline` is never called.
    - `qna/page.tsx:114` handles a `token` the backend never sends.

31. **The landing page has two problems.** It advertises "Flashcards", which don't exist (`page.tsx:255`), and has a stray `d` after "AI-Powered" (`page.tsx:168`).

32. **Next.js tooling mismatch.** `eslint-config-next` is 15.3.4 while Next is 16, and `next lint` no longer exists in Next 16, so `npm run lint` is broken.

33. **Unused or ignored frontend packages.**
    - `lucide-react` is unused.
    - `tailwind-scrollbar` is only referenced from `tailwind.config.js`, which Tailwind v4 ignores without an `@config` directive.
    - 🆕 That config also mixes `import` with `module.exports`, so the Cabin font setting in it is dead too.

34. 🆕 **Fonts are set in four places that override each other.** `layout.tsx` loads Cabin, Geist and Geist Mono; `globals.css` sets Arial; every page then `@import`s Inter. The metadata description is still "Generated by create next app".

35. **Icon helpers and large inline `<style>` blocks are copy-pasted** across all 5 page and component files.

36. **The retry logic reads a stale `retryCount`** from a closure (`content/page.tsx:129-140`).

37. **`alert()` is used for errors** (`content/page.tsx:161,176`, `notes/page.tsx:135,195`).

38. 🆕 **`onKeyPress` is deprecated** (`content/components/chatbot.tsx:285`). Use `onKeyDown`.

39. **There are no tests**, backend or frontend.

40. **Docker Compose has no frontend service.** The README does say to start the frontend separately. 🆕 Compose also hardcodes Postgres credentials, exposes port 5432 publicly, and uses the obsolete `version:` key.

41. 🆕 **`.vscode/settings.json` is committed** at the repo root, although the backend's `.gitignore` excludes `.vscode/`.

---

## Notes

- **#2 and #4 have the same root cause:** data that belongs to one video is stored in a shared place (the browser's localStorage, or Python module globals) instead of being looked up by `video_id`. Fixing that pattern fixes both.
- **#10 and #12 interact.** A timed-out frontend retries, the retry hits the lock race, and the server can end up transcribing the same video twice.
