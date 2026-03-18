import jwt, time
import os
import hashlib

from fastapi import HTTPException, Header
from dotenv import load_dotenv

load_dotenv()

SECRET = os.getenv("SECRET", "")

if not SECRET:
    raise RuntimeError("SECRET environment variable is required")

if len(SECRET.encode("utf-8")) < 32:
    SECRET = hashlib.sha256(SECRET.encode("utf-8")).hexdigest()

def create_flow_token(video_id: str, step: int = 1):
    payload = {
        "video_id": video_id,
        "step": step,
        "exp": int(time.time()) + 3600  # 1 hour expiry
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")

def verify_flow_token(
    authorization: str | None,
    required_step: int
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    if payload.get("step") != required_step:
        raise HTTPException(
            status_code=403,
            detail="Invalid flow order"
        )

    return payload

