def transcribe(model, audio_path):
    segments, _ = model.transcribe(audio_path, language="en")
    return " ".join(s.text for s in segments)
