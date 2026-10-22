import json
import os
import tempfile
import threading
import traceback

from dotenv import load_dotenv
from faster_whisper import WhisperModel
from groq import Groq

# Order matters: BART (summarizer) must load before the sentence-transformers model
# (chatbot.rag); the other way round segfaults in torch on macOS
from services.summarizer import extractive_summary, rewrite_offline, split_into_points
from cache_db import get_cached_video, save_video
from chatbot.rag import chunk_transcript, embed_chunks
from services.transcription import transcribe
from services.utils import extract_video_id, download_audio, fit_transcript

load_dotenv()

# Whisper Model Load
stt_model = WhisperModel("base", device="cpu", compute_type="int8")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"), max_retries=4)

# One lock per video, so two requests for the same video don't both process it.
# ponytail: locks are never removed (a few hundred bytes per video ever analyzed in this process);
# removing them safely needs a waiter count. Per process only; a second worker needs a DB lock.
processing_locks: dict[str, threading.Lock] = {}
lock_manager_lock = threading.Lock()

def process_video_with_topics(video_url):
    """
    Process video by downloading, transcribing, and generating topic-wise detailed content
    """
    video_id = extract_video_id(video_url)

    cached = get_cached_video(video_id)
    if cached and "topics" in cached:
        return cached

    with lock_manager_lock:
        video_lock = processing_locks.setdefault(video_id, threading.Lock())

    if video_lock.locked():
        print(f"Video {video_id} is already being processed, waiting...")
    with video_lock:
        # Whoever held the lock may have just cached it
        cached = get_cached_video(video_id)
        if cached and "topics" in cached:
            return cached

        # Download and transcribe
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = os.path.join(temp_dir, "audio.mp3")
            download_audio(video_url, audio_path)
            transcript = transcribe(stt_model, audio_path)

        # Generate comprehensive topic-wise analysis
        topics = generate_comprehensive_topics(transcript)
        summary = generate_summary_detailed(transcript)

        # Same shape as get_cached_video(), so fresh and cached responses match
        result = {
            "video_id": video_id,
            "transcript": transcript,
            "summary": summary,
            "topics": topics
        }

        print(f"Generated {len(topics)} topics for video {video_id}")

        # Embed chat chunks once here so /query never re-embeds the transcript
        try:
            chunks = chunk_transcript(transcript)
            embeddings = embed_chunks(chunks).tobytes() if chunks else None
        except Exception as e:
            print(f"Embedding failed for {video_id}, chat will embed on first question: {e}")
            embeddings = None

        # Not optional: quiz, notes and chat all read the video from the cache, so a failed
        # save would hand back a result whose follow-up features all say "not processed"
        save_video(video_id, transcript, summary, topics, embeddings)

        return result

def generate_summary_detailed(transcript):
    """
    Generate main and detailed summaries for the transcript
    """
    extractive_text = extractive_summary(transcript, 10)
    summary = rewrite_offline(extractive_text, mode="main")

    if(not summary or len(summary.strip()) < 50):
        summary = transcript[:500]  # Fallback
        
    return summary

def generate_comprehensive_topics(transcript):
    """Topics with detailed points: from the LLM, or the offline heuristic if that fails."""
    try:
        topics = llm_topics(transcript)
        if topics:
            return topics
    except Exception as e:
        print(f"LLM topics failed, using offline topics: {e}")
    return heuristic_topics(transcript)


def llm_topics(transcript):
    """3-6 real topics from the transcript, in the {topic, detailed_points} shape the frontend uses."""
    prompt = f"""Split this video transcript into its 3 to 6 main topics, in the order they come up.
For each topic give a short title (under 70 characters) and 3 to 6 points that explain
what the video says about it, each one or two full sentences. Only use what the transcript says.

Return ONLY JSON: {{"topics": [{{"topic": "Title", "detailed_points": ["Point.", "Point."]}}]}}

Transcript:
{fit_transcript(transcript)}
"""
    # JSON mode occasionally rejects a generation; one retry usually succeeds
    for attempt in range(2):
        try:
            res = groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=1500,  # ~600 used with low reasoning
                reasoning_effort="low",  # its hidden reasoning otherwise uses most of max_tokens
                response_format={"type": "json_object"},
            )
            raw = json.loads(res.choices[0].message.content).get("topics", [])
            break
        except Exception as e:
            print(f"Topic generation attempt {attempt + 1} failed: {e}")
    else:
        return None

    topics = []
    for t in raw if isinstance(raw, list) else []:
        if not isinstance(t, dict):
            continue
        title = str(t.get("topic", "")).strip()
        points = [str(p).strip() for p in t.get("detailed_points", []) if str(p).strip()]
        if title and points:
            topics.append({"topic": title[:80], "detailed_points": points})
    return topics


def heuristic_topics(transcript):
    """
    Offline fallback: equal word-count slices of the transcript, each summarized by BART
    """
    try:
        # Split transcript into meaningful chunks (roughly 3-5 topics)
        words = transcript.split()
        total_words = len(words)
        num_topics = min(5, max(3, total_words // 300))  # 3-5 topics based on length
        
        chunk_size = total_words // num_topics
        topics = []
        
        for i in range(num_topics):
            start_idx = i * chunk_size
            end_idx = (i + 1) * chunk_size if i < num_topics - 1 else total_words
            chunk_text = " ".join(words[start_idx:end_idx])
            
            if not chunk_text.strip():
                continue
            
            try:
                # Extract key content from this chunk
                extractive_text = extractive_summary(chunk_text, 8)
                summary = rewrite_offline(extractive_text, mode="detailed")
                
                # Split into detailed points
                points = split_into_points(summary)
                
                # Generate topic title from first sentence
                topic_title = points[0] if points else summary[:60] + "..."
                if len(topic_title) > 80:
                    topic_title = topic_title[:77] + "..."
                
                # Create detailed content list (remaining points)
                
                detailed_points = points[1:] if len(points) > 1 else [summary]
                
                topics.append({
                    "topic": topic_title,
                    "detailed_points": detailed_points
                })
            except Exception as e:
                print(f"ERROR processing topic {i}: {str(e)}")
                traceback.print_exc()
                # Skip this topic and continue
                continue
        
        if not topics:
            # Fallback: return a basic summary if all topic generation fails
            summary = rewrite_offline(transcript, mode="detailed")
            points = split_into_points(summary)
            topics = [{
                "topic": "Overview",
                "detailed_points": points if points else [summary]
            }]
        
        return topics
    except Exception as e:
        print(f"ERROR in generate_comprehensive_topics: {str(e)}")
        traceback.print_exc()
        raise
