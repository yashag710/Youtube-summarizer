MAX_VIDEO_MINUTES = 30  # transcription is CPU-bound; longer videos also outlast the frontend's 15-min timeout
MIN_TRANSLATED_WORDS = 30  # less than this from a non-English video means Whisper couldn't translate it

# Names for the error message; anything else falls back to the language code
LANGUAGE_NAMES = {
    "hi": "Hindi", "ur": "Urdu", "bn": "Bengali", "ta": "Tamil", "te": "Telugu", "mr": "Marathi",
    "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi", "es": "Spanish",
    "fr": "French", "de": "German", "pt": "Portuguese", "it": "Italian", "ru": "Russian",
    "ja": "Japanese", "ko": "Korean", "zh": "Chinese", "ar": "Arabic", "tr": "Turkish",
}


class VideoTooLong(Exception):
    pass


class UnsupportedLanguage(Exception):
    pass


def transcribe(model, audio_path):
    """English transcript of the audio. Non-English speech is translated to English by Whisper."""
    # Language detection runs here on the first 30s; segments is lazy, so nothing else has run yet
    segments, info = model.transcribe(audio_path)
    # Rejects long videos before the model runs.
    # ponytail: the audio is still downloaded first; add yt-dlp --match-filter if bandwidth matters
    if info.duration > MAX_VIDEO_MINUTES * 60:
        raise VideoTooLong(
            f"Video is {info.duration / 60:.0f} min long; the limit is {MAX_VIDEO_MINUTES} min."
        )
    if info.language == "en":
        return " ".join(s.text for s in segments)

    segments, _ = model.transcribe(audio_path, task="translate", language=info.language)
    text = " ".join(s.text for s in segments).strip()
    if len(text.split()) < MIN_TRANSLATED_WORDS:
        name = LANGUAGE_NAMES.get(info.language, f'"{info.language}"')
        raise UnsupportedLanguage(
            f"This video is in {name}, and an English transcript couldn't be made from it. "
            "Try a video in English."
        )
    print(f"Translated {info.language} audio (p={info.language_probability:.2f}) to English")
    return text
