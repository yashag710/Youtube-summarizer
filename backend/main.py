from fastapi import FastAPI, Query, Body, HTTPException, Header
from services.video_service import process_video_with_topics
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

class AnalyzeRequest(BaseModel):
    video_link: str

@app.post("/analyze")
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
    
    # Step 2: Process the video
    try:
        result = process_video_with_topics(video_link)
        return result
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"ERROR in /analyze: {str(e)}")
        print(f"TRACEBACK: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")

@app.post("/generate_qna")
def generate_qna_route(
    video_id: str = Query(...),
    authorization: str = Header(None)
):
    return generate_video_qna(video_id, authorization)

@app.get("/query")
def chatbot(query: str = Query(...), video_id: str = Query(...)):
    from cache_db import get_cached_video
    from chatbot.rag import load_index, embedder
    import faiss
    import numpy as np
    
    # Get video data from cache
    cached = get_cached_video(video_id)
    if not cached or not cached.get("transcript"):
        raise HTTPException(status_code=404, detail="Video not found or transcript not available")
    
    transcript = cached["transcript"]
    
    # Split transcript into chunks
    words = transcript.split()
    chunk_size = 200
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
    
    # Create FAISS index
    embeddings = embedder.encode(chunks).astype("float32")
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(embeddings)
    
    # Load into RAG system
    load_index(index, chunks)
    
    # Get response
    return {"response": chatbot_response(query)}

@app.post("/generate_token")
def generate_token(video_id : str = Query(...), step: int = Query(1)):
    token = create_flow_token(video_id, step)
    return {"token": token}

@app.post("/notes")
def generate_notes(video_id : str = Query(...)):
    return generate_video_notes(video_id)