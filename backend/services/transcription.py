MAX_VIDEO_MINUTES = 30  # transcription is CPU-bound; longer videos also outlast the frontend's 5-min timeout


class VideoTooLong(Exception):
    pass


def transcribe(model, audio_path):
    segments, info = model.transcribe(audio_path, language="en")
    # segments is lazy, so this rejects long videos before the model runs.
    # ponytail: the audio is still downloaded first; add yt-dlp --match-filter if bandwidth matters
    if info.duration > MAX_VIDEO_MINUTES * 60:
        raise VideoTooLong(
            f"Video is {info.duration / 60:.0f} min long; the limit is {MAX_VIDEO_MINUTES} min."
        )
    return " ".join(s.text for s in segments)
