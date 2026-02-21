import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

embedder = SentenceTransformer("all-MiniLM-L6-v2")

# This index can be loaded from file if you persist it
# index = faiss.read_index("path/to/index.faiss")

# For now assume `index` and `chunks` are global or injected
index = None
chunks = None

def load_index(faiss_index, video_chunks):
    global index, chunks
    index = faiss_index
    chunks = video_chunks

def search(query, top_k=3):
    if index is None:
        return ""  # fail-safe fallback
    
    vector = embedder.encode([query]).astype("float32")
    distances, ids = index.search(vector, top_k)
    
    return " ".join(chunks[i] for i in ids[0])
