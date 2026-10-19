import psycopg2
import json
import os

from psycopg2 import sql
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

# PostgreSQL connection parameters from environment variables
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT"))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
TTL_HOURS = 24


def get_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )


def init_db():
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # Create table if it doesn't exist
        cur.execute("""
        CREATE TABLE IF NOT EXISTS videos (
            video_id TEXT PRIMARY KEY,
            transcript TEXT NOT NULL,
            summary TEXT,
            topics TEXT,
            created_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL
        );
        """)

        # Chunk embeddings for the chatbot (float32 bytes). Added after the table first
        # shipped; IF NOT EXISTS upgrades existing databases in place, old rows stay NULL.
        cur.execute("ALTER TABLE videos ADD COLUMN IF NOT EXISTS embeddings BYTEA;")

        # Create index on video_id for faster lookups
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_video_id ON videos(video_id);
        """)
        
        # Create index on expires_at for cleanup queries
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_expires_at ON videos(expires_at);
        """)
        
        conn.commit()
        cur.close()
        conn.close()
        print("Database initialized successfully")
    except Exception as e:
        print(f"Error initializing database: {e}")
        raise


def get_cached_video(video_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        cur.execute(
            "SELECT transcript, summary, topics, expires_at FROM videos WHERE video_id = %s",
            (video_id,)
        )
        row = cur.fetchone()
        
        if not row:
            cur.close()
            conn.close()
            return None
        
        expires_at = row[3]
        if expires_at < datetime.utcnow():
            cur.close()
            conn.close()
            delete_video(video_id)
            return None
        
        refresh_expiry(video_id)
        
        result = {
            "video_id": video_id,
            "transcript": row[0],
            "summary": row[1]
        }
        
        # Parse topics if available
        if row[2]:
            try:
                result["topics"] = json.loads(row[2])
            except:
                pass
        
        cur.close()
        conn.close()
        return result
    except Exception as e:
        print(f"Error retrieving cached video: {e}")
        return None


def save_video(video_id, transcript, summary, topics=None, embeddings=None):
    try:
        now = datetime.utcnow()
        expires = now + timedelta(hours=TTL_HOURS)

        topics_json = json.dumps(topics) if topics else None

        conn = get_connection()
        cur = conn.cursor()

        # PostgreSQL upsert using ON CONFLICT
        cur.execute("""
        INSERT INTO videos
        (video_id, transcript, summary, topics, embeddings, created_at, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (video_id) DO UPDATE SET
            transcript = EXCLUDED.transcript,
            summary = EXCLUDED.summary,
            topics = EXCLUDED.topics,
            embeddings = EXCLUDED.embeddings,
            expires_at = EXCLUDED.expires_at
        """, (
            video_id,
            transcript,
            summary,
            topics_json,
            embeddings,
            now,
            expires
        ))
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error saving video to cache: {e}")
        raise


def get_embeddings(video_id):
    # Kept out of get_cached_video() so raw bytes never reach JSON API responses
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT embeddings FROM videos WHERE video_id = %s", (video_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return bytes(row[0]) if row and row[0] is not None else None
    except Exception as e:
        print(f"Error retrieving embeddings: {e}")
        return None


def save_embeddings(video_id, embeddings):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE videos SET embeddings = %s WHERE video_id = %s",
            (embeddings, video_id)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error saving embeddings: {e}")


def refresh_expiry(video_id):
    try:
        new_expiry = datetime.utcnow() + timedelta(hours=TTL_HOURS)
        conn = get_connection()
        cur = conn.cursor()
        
        cur.execute(
            "UPDATE videos SET expires_at = %s WHERE video_id = %s",
            (new_expiry, video_id)
        )
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error refreshing expiry: {e}")


def delete_video(video_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        cur.execute("DELETE FROM videos WHERE video_id = %s", (video_id,))
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error deleting video from cache: {e}")
