import json
import os
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from psycopg2.pool import ThreadedConnectionPool

load_dotenv()

# PostgreSQL connection parameters from environment variables
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
TTL_HOURS = 24

# Generated content cached per video, keyed by the endpoint that makes it
GENERATED_COLUMNS = {"quiz", "notes"}

# psycopg2's pool raises PoolError when every connection is in use instead of waiting, and
# get_cached_video would read that as a cache miss and re-process the video. The semaphore
# makes extra callers wait for a free connection instead.
MAX_CONNECTIONS = 10
_slots = threading.BoundedSemaphore(MAX_CONNECTIONS)
_pool = None
_pool_lock = threading.Lock()


def _utcnow():
    # Columns are TIMESTAMP without time zone holding UTC, so compare with a naive UTC value
    return datetime.now(timezone.utc).replace(tzinfo=None)


@contextmanager
def db():
    """A cursor from the shared pool; commits on success, rolls back on error.
    ponytail: 10 connections for one uvicorn process; queries are short, so FastAPI's 40 threads
    rarely wait. Raise MAX_CONNECTIONS (and Postgres max_connections) if they do."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ThreadedConnectionPool(
                    2, MAX_CONNECTIONS, host=DB_HOST, port=DB_PORT, database=DB_NAME, user=DB_USER, password=DB_PASSWORD
                )
    with _slots:
        conn = _pool.getconn()
        try:
            with conn.cursor() as cur:
                yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            _pool.putconn(conn)


def init_db():
    try:
        with db() as cur:
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
            # Columns added after the table first shipped; IF NOT EXISTS upgrades existing
            # databases in place, old rows stay NULL.
            cur.execute("ALTER TABLE videos ADD COLUMN IF NOT EXISTS embeddings BYTEA;")  # chatbot chunk vectors
            cur.execute("ALTER TABLE videos ADD COLUMN IF NOT EXISTS quiz TEXT;")
            cur.execute("ALTER TABLE videos ADD COLUMN IF NOT EXISTS notes TEXT;")
            # The primary key already indexes video_id; this duplicate only slowed writes
            cur.execute("DROP INDEX IF EXISTS idx_video_id;")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_expires_at ON videos(expires_at);")
        print("Database initialized successfully")
    except Exception as e:
        print(f"Error initializing database: {e}")
        raise


def get_cached_video(video_id):
    try:
        # One round trip: only unexpired rows match, and reading one extends its expiry
        with db() as cur:
            cur.execute(
                """UPDATE videos SET expires_at = %s
                   WHERE video_id = %s AND expires_at >= %s
                   RETURNING transcript, summary, topics""",
                (_utcnow() + timedelta(hours=TTL_HOURS), video_id, _utcnow()),
            )
            row = cur.fetchone()
        if not row:
            return None

        result = {"video_id": video_id, "transcript": row[0], "summary": row[1]}
        if row[2]:
            try:
                result["topics"] = json.loads(row[2])
            except json.JSONDecodeError:
                pass
        return result
    except Exception as e:
        print(f"Error retrieving cached video: {e}")
        return None


def save_video(video_id, transcript, summary, topics=None, embeddings=None):
    now = _utcnow()
    with db() as cur:
        # Expired rows are never read again; clear them out while we're writing anyway
        cur.execute("DELETE FROM videos WHERE expires_at < %s", (now,))
        # Re-analysis replaces the transcript, so quiz and notes made from the old one are dropped
        cur.execute("""
        INSERT INTO videos
        (video_id, transcript, summary, topics, embeddings, created_at, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (video_id) DO UPDATE SET
            transcript = EXCLUDED.transcript,
            summary = EXCLUDED.summary,
            topics = EXCLUDED.topics,
            embeddings = EXCLUDED.embeddings,
            expires_at = EXCLUDED.expires_at,
            quiz = NULL,
            notes = NULL
        """, (
            video_id, transcript, summary, json.dumps(topics) if topics else None,
            embeddings, now, now + timedelta(hours=TTL_HOURS),
        ))


def get_generated(video_id, column):
    """Cached quiz/notes JSON for a video, or None."""
    assert column in GENERATED_COLUMNS
    try:
        with db() as cur:
            cur.execute(f"SELECT {column} FROM videos WHERE video_id = %s", (video_id,))
            row = cur.fetchone()
        return json.loads(row[0]) if row and row[0] else None
    except Exception as e:
        print(f"Error retrieving cached {column}: {e}")
        return None


def save_generated(video_id, column, value):
    assert column in GENERATED_COLUMNS
    try:
        with db() as cur:
            cur.execute(f"UPDATE videos SET {column} = %s WHERE video_id = %s", (json.dumps(value), video_id))
    except Exception as e:
        # The caller already has the result; a failed cache write only costs a regeneration later
        print(f"Error saving {column}: {e}")


def get_embeddings(video_id):
    # Kept out of get_cached_video() so raw bytes never reach JSON API responses
    try:
        with db() as cur:
            cur.execute("SELECT embeddings FROM videos WHERE video_id = %s", (video_id,))
            row = cur.fetchone()
        return bytes(row[0]) if row and row[0] is not None else None
    except Exception as e:
        print(f"Error retrieving embeddings: {e}")
        return None


def save_embeddings(video_id, embeddings):
    try:
        with db() as cur:
            cur.execute("UPDATE videos SET embeddings = %s WHERE video_id = %s", (embeddings, video_id))
    except Exception as e:
        print(f"Error saving embeddings: {e}")


def delete_video(video_id):
    try:
        with db() as cur:
            cur.execute("DELETE FROM videos WHERE video_id = %s", (video_id,))
    except Exception as e:
        print(f"Error deleting video from cache: {e}")
