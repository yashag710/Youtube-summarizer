import tempfile, os, re, subprocess, sys, traceback
from faster_whisper import WhisperModel
from dotenv import load_dotenv
from services.summarizer import extractive_summary, rewrite_offline, generate_topics_offline, split_into_points
from services.utils import extract_video_id, download_audio
from cache_db import get_cached_video, save_video
from services.transcription import transcribe
import threading
import time

load_dotenv()

# Whisper Model Load
stt_model = WhisperModel("base", device="cpu", compute_type="int8")

# Video processing lock to prevent concurrent processing of same video
processing_locks = {}
lock_manager_lock = threading.Lock()

def process_video_with_topics(video_url):
    """
    Process video by downloading, transcribing, and generating topic-wise detailed content
    """
    video_id = extract_video_id(video_url)
    
    # Check cache first
    cached = get_cached_video(video_id)
    if cached and "topics" in cached:
        return cached
    
    # Acquire lock for this video to prevent concurrent processing
    with lock_manager_lock:
        if video_id not in processing_locks:
            processing_locks[video_id] = threading.Lock()
        video_lock = processing_locks[video_id]
    
    # Try to acquire the video-specific lock
    lock_acquired = video_lock.acquire(blocking=False)
    if not lock_acquired:
        # Another request is already processing this video, wait and check cache
        print(f"Video {video_id} is already being processed, waiting...")
        video_lock.acquire(blocking=True)  # Wait for other process to finish
        video_lock.release()
        # Check cache again after waiting
        cached = get_cached_video(video_id)
        if cached and "topics" in cached:
            return cached
        # If still not cached, proceed with processing (edge case)
        video_lock.acquire()
    
    try:
        # Double-check cache after acquiring lock
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

        result = {
            "video_id": video_id,
            "summary": summary,
            "topics": topics
        }
        
        print(f"Generated {len(topics)} topics for video {video_id}")
        # Save to cache (updated to include topics)
        try:
            save_video(video_id, transcript, summary, topics)
        except:
            pass  # Cache save is optional
        
        return result
    finally:
        # Always release the lock
        video_lock.release()
        # Clean up lock object after a delay
        with lock_manager_lock:
            if video_id in processing_locks:
                del processing_locks[video_id]

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
    """
    Generate topics with detailed points for each topic
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
