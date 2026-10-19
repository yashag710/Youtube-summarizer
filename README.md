# YouTube Summarizer (Vbloc)

AI-powered learning app that converts YouTube videos into:
- structured topic-wise summaries,
- interactive Q&A quizzes, and
- downloadable study notes.

It uses a FastAPI backend for video processing + AI generation, a Next.js frontend for the user interface, and PostgreSQL for caching processed videos.

---

## Features

- YouTube link ingestion and analysis pipeline.
- Automatic transcript extraction (Whisper/faster-whisper).
- Topic-wise summarization and detailed key points.
- Token-gated flow for staged actions (`analyze` -> `qna`).
- AI-generated 20-question quizzes (mixed difficulty + question types).
- In-app chatbot (RAG + LLM fallback) for video-specific questions.
- Study notes generation with export options:
	- Markdown
	- Plain text
	- PDF
- PostgreSQL-backed cache with TTL-based expiry.

---

## Tech Stack

### Backend
- Python 3.11
- FastAPI + Uvicorn
- PostgreSQL (`psycopg2`)
- `yt-dlp` + `ffmpeg`
- `faster-whisper` / `openai-whisper`
- Hugging Face Transformers (`facebook/bart-large-cnn`)
- Groq API (`openai/gpt-oss-120b` for quiz and chat, `openai/gpt-oss-20b` for notes)
- FAISS + sentence-transformers for retrieval

### Frontend
- Next.js (App Router)
- React
- Tailwind CSS
- Axios
- html2canvas + jsPDF (notes export)

### Infra
- Docker + Docker Compose

---

## Project Structure

```text
.
├── docker-compose.yml
├── backend/
│   ├── main.py
│   ├── cache_db.py
│   ├── services/
│   └── chatbot/
└── frontend/
		├── package.json
		└── src/app/
				├── page.tsx
				├── content/
				├── qna/
				└── notes/
```

---

## How It Works (Flow)

1. User submits a YouTube URL on the landing page.
2. Frontend requests `POST /generate_token?video_id=<id>` (always a step-1 token).
3. Frontend calls `POST /analyze` with Bearer token. The token's video must match the link.
4. Backend downloads audio, transcribes, summarizes, and caches result. Videos longer than 30 minutes are rejected.
5. `/analyze` returns a step-2 `qna_token` alongside the results. User can:
	 - open chatbot (`GET /query`),
	 - generate notes (`POST /notes`),
	 - or generate quiz by calling `POST /generate_qna` with the `qna_token`.

---

## Prerequisites

For Docker setup:
- Docker
- Docker Compose

For local (without Docker):
- Python 3.11+
- Node.js 22+ (the frontend needs 20+; yt-dlp needs 22+ to solve YouTube's JS challenge)
- npm
- PostgreSQL 15+
- ffmpeg
- yt-dlp

---

## Environment Variables

### Backend (`backend/.env`)

Create `backend/.env` with values like:

```env
# API
GROQ_API_KEY=your_groq_api_key

# JWT/token flow
SECRET=your_long_random_secret

# PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=youtube_summarizer
DB_USER=postgres
DB_PASSWORD=postgres

# yt-dlp (optional)
# Rotating residential proxy, tried before the direct connection. {session} is replaced
# with a fresh id per download so the provider keeps one IP for the whole download.
YTDLP_PROXY=http://username-session-{session}:password@gateway.example.com:7000
YTDLP_TIMEOUT_SECONDS=1200
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> Security note: never commit real API keys/secrets. If keys were committed at any point, rotate them immediately.

---

## Run with Docker (Recommended)

From repo root:

```bash
docker compose up --build
```

Services:
- Frontend: start separately (see below) on `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Postgres: `localhost:5432`

Backend container details:
- Runs Uvicorn, with Node 22 for yt-dlp.
- Set `YTDLP_PROXY` in `backend/.env` when deployed; server IPs usually hit YouTube's bot check.

---

## Run Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:3000`

---

## Run Locally (Without Docker)

### 1) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Make sure PostgreSQL is running and `.env` points to valid DB credentials.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## API Endpoints

Base URL: `http://localhost:8000`

### `POST /generate_token`
Generate a step-1 flow token. Step-2 tokens are only issued by `/analyze`.

Query params:
- `video_id` (required)

### `POST /analyze`
Analyze a video and cache results. Rejects links whose video ID differs from the token's, and videos longer than 30 minutes (`400`).

Headers:
- `Authorization: Bearer <step-1-token>`

Body:
```json
{
	"video_link": "https://www.youtube.com/watch?v=..."
}
```

Returns:
- `video_id`
- `transcript`
- `summary`
- `topics`
- `qna_token` (step-2 token for `/generate_qna`)

### `POST /generate_qna`
Generate 20 quiz questions for a processed video.

Query params:
- `video_id` (required)

Headers:
- `Authorization: Bearer <qna_token from /analyze>`

### `POST /notes`
Generate structured study notes.

Query params:
- `video_id` (required)

### `GET /query`
Ask chatbot about a processed video.

Query params:
- `query` (required)
- `video_id` (required)

### Rate limits

Per client IP, in memory (reset on restart; one uvicorn worker assumed). Exceeding a limit returns `429` with a `Retry-After` header.

| Endpoint | Limit |
|---|---|
| `POST /analyze` | 20 per hour |
| `POST /generate_qna` | 10 per hour |
| `POST /notes` | 20 per hour |
| `GET /query` | 30 per 10 minutes |

---

## Database / Cache

Table: `videos`
- `video_id` (PK)
- `transcript`
- `summary`
- `topics` (JSON stored as text)
- `embeddings` (chatbot chunk vectors, float32 bytes; computed during `/analyze`, added automatically to existing databases on startup)
- `created_at`
- `expires_at`

Cache TTL is currently set to **24 hours** in `backend/cache_db.py`.

---

## Notes for YouTube Download Reliability

Downloads try, in order: the rotating proxy (if `YTDLP_PROXY` is set), a direct connection, then a direct connection with HLS formats. No cookies are used, so age-restricted and members-only videos can't be downloaded.

When every attempt fails, the error lists each attempt's reason (for example `proxy: ERROR: ... Sign in to confirm you're not a bot`). If downloads fail:
- deployed: set `YTDLP_PROXY` to a residential provider with sticky sessions (datacenter IPs are often blocked),
- update `yt-dlp`,
- verify Node.js 22+ is installed in the backend runtime,
- increase `YTDLP_TIMEOUT_SECONDS`.

---

## Development Scripts

### Frontend
- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - lint

---

## Future Improvements

- Add migration tooling (Alembic) for DB schema evolution.
- Add test suites for backend and frontend.
- Add queue/background worker for long-running analysis jobs.
- Add authentication for multi-user support.

