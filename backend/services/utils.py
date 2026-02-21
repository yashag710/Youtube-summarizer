import re, subprocess

def extract_video_id(url):
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if not match:
        raise ValueError("Invalid YouTube URL")
    return match.group(1)

def download_audio(video_url, path):
    command = ["yt-dlp", "--no-playlist", "-x", "--audio-format", "mp3", "-o", path, video_url]
    subprocess.run(command, check=True)
