import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from cache_db import get_embeddings, save_embeddings

embedder = SentenceTransformer("all-MiniLM-L6-v2")
DIM = embedder.get_sentence_embedding_dimension()

# MiniLM reads at most 256 tokens; 200-word chunks measured ~250, so some got cut off
CHUNK_WORDS = 150


def chunk_transcript(transcript: str) -> list[str]:
    words = transcript.split()
    return [" ".join(words[i:i + CHUNK_WORDS]) for i in range(0, len(words), CHUNK_WORDS)]


def embed_chunks(chunks: list[str]) -> np.ndarray:
    return embedder.encode(chunks).astype("float32")


def load_video_index(video_id: str, transcript: str):
    """
    Return (chunks, embeddings) for a video. Embeddings are computed once during /analyze
    and stored in Postgres; rows from before that (or with a stale chunk size) are
    embedded here once and saved back.
    """
    chunks = chunk_transcript(transcript)
    if not chunks:
        return chunks, None

    stored = get_embeddings(video_id)
    if stored and len(stored) == len(chunks) * DIM * 4:  # float32 = 4 bytes
        return chunks, np.frombuffer(stored, dtype="float32").reshape(-1, DIM)

    embeddings = embed_chunks(chunks)
    save_embeddings(video_id, embeddings.tobytes())
    return chunks, embeddings


def search(query, chunks, embeddings, top_k=3):
    if not chunks:
        return ""

    # ponytail: rebuilding a flat index per query is microseconds for a few dozen vectors
    index = faiss.IndexFlatL2(DIM)
    index.add(embeddings)
    _, ids = index.search(embed_chunks([query]), top_k)
    # FAISS returns -1 when there are fewer than top_k chunks
    return " ".join(chunks[i] for i in ids[0] if i != -1)
