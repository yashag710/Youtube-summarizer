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
- Groq API (Llama models)
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
2. Frontend requests `POST /generate_token?video_id=<id>&step=1`.
3. Frontend calls `POST /analyze` with Bearer token.
4. Backend downloads audio, transcribes, summarizes, and caches result.
5. User can:
	 - open chatbot (`GET /query`),
	 - generate notes (`POST /notes`),
	 - or generate quiz by obtaining step-2 token and calling `POST /generate_qna`.

---

## Prerequisites

For Docker setup:
- Docker
- Docker Compose

For local (without Docker):
- Python 3.11+
- Node.js 20+
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

# yt-dlp (optional but recommended)
YTDLP_COOKIES_FILE=/app/youtube_cookies.txt
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
- Starts Tor + Uvicorn.
- Mounts cookies file from host:
	- host: `backend/youtube_cookies.txt`
	- container: `/app/youtube_cookies.txt`

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
Generate flow token.

Query params:
- `video_id` (required)
- `step` (optional, default: `1`)

### `POST /analyze`
Analyze a video and cache results.

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
- `summary`
- `topics`

### `POST /generate_qna`
Generate 20 quiz questions for a processed video.

Query params:
- `video_id` (required)

Headers:
- `Authorization: Bearer <step-2-token>`

### `POST /notes`
Generate structured study notes.

Query params:
- `video_id` (required)

### `GET /query`
Ask chatbot about a processed video.

Query params:
- `query` (required)
- `video_id` (required)

---

## Database / Cache

Table: `videos`
- `video_id` (PK)
- `transcript`
- `summary`
- `topics` (JSON stored as text)
- `created_at`
- `expires_at`

Cache TTL is currently set to **24 hours** in `backend/cache_db.py`.

---

## Notes for YouTube Download Reliability

`yt-dlp` strategies include Tor + optional cookies.

If download fails for restricted videos:
- provide a valid cookies file,
- update `yt-dlp`,
- verify Node.js is installed in backend runtime,
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

