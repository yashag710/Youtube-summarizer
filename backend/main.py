import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import FastAPI, Query, Body, HTTPException, Header, Request, Depends
from services.video_service import process_video_with_topics
from services.transcription import VideoTooLong
from services.utils import extract_video_id
from services.qna_service import generate_video_qna
from chatbot.pipeline import chatbot_response
from services.flow_token import create_flow_token
from cache_db import init_db
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.flow_token import verify_flow_token
from services.notes_service import generate_video_notes

# Initialize database schema (runs migrations)
init_db()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # frontend origin
    allow_credentials=True,
    allow_methods=["*"],   # IMPORTANT
    allow_headers=["*"],   # IMPORTANT
)

_hits: dict[tuple[str, str], deque] = defaultdict(deque)
_hits_lock = Lock()

def rate_limit(name: str, limit: int, window_seconds: int):
    """Per-IP sliding-window limit, used as a route dependency.
    ponytail: in-memory and per process; move to Redis if running more than one worker.
    Behind a reverse proxy request.client.host is the proxy, so read X-Forwarded-For there."""
    def check(request: Request):
        key = (name, request.client.host if request.client else "unknown")
        now = time.monotonic()
        with _hits_lock:
            hits = _hits[key]
            while hits and hits[0] <= now - window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = int(hits[0] + window_seconds - now) + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many requests. Try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)
    return Depends(check)

class AnalyzeRequest(BaseModel):
    video_link: str

@app.post("/analyze", dependencies=[rate_limit("analyze", 20, 3600)])
def analyze_video(
    request : AnalyzeRequest,
    authorization: str = Header(None)
):
    video_link = request.video_link
    # Step 1: Verify token (required_step=1 for initial analysis)
    try:
        payload = verify_flow_token(authorization, required_step=1)
        video_id = payload.get("video_id")
    except HTTPException:
        raise

    try:
        link_video_id = extract_video_id(video_link)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    if link_video_id != video_id:
        raise HTTPException(status_code=403, detail="Token was issued for a different video")

    # Step 2: Process the video
    try:
        result = process_video_with_topics(video_link)
        # The step-2 token is only handed out after a successful analysis, so Q&A can't skip it
        return {**result, "qna_token": create_flow_token(result["video_id"], step=2)}
    except VideoTooLong as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"ERROR in /analyze: {str(e)}")
        print(f"TRACEBACK: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")

@app.post("/generate_qna", dependencies=[rate_limit("generate_qna", 10, 3600)])
def generate_qna_route(
    video_id: str = Query(...),
    authorization: str = Header(None)
):
    return generate_video_qna(video_id, authorization)

@app.get("/query", dependencies=[rate_limit("query", 30, 600)])
def chatbot(query: str = Query(...), video_id: str = Query(...)):
    from cache_db import get_cached_video
    from chatbot.rag import load_video_index

    # Get video data from cache
    cached = get_cached_video(video_id)
    if not cached or not cached.get("transcript"):
        raise HTTPException(status_code=404, detail="Video not found or transcript not available")

    # Stored embeddings from /analyze; only the question itself is embedded here.
    # Everything is per request, so concurrent chats can't see each other's video.
    chunks, embeddings = load_video_index(video_id, cached["transcript"])

    # Get response
    return {"response": chatbot_response(query, chunks, embeddings)}

@app.post("/generate_token")
def generate_token(video_id : str = Query(...)):
    # Only step 1 is public; the step-2 token comes from a successful /analyze
    token = create_flow_token(video_id, 1)
    return {"token": token}

@app.post("/notes", dependencies=[rate_limit("notes", 20, 3600)])
def generate_notes(video_id : str = Query(...)):
    return generate_video_notes(video_id)