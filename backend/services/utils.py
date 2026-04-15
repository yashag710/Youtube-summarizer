import glob
import os
import re
import subprocess


def extract_video_id(url: str) -> str:
    """
    Extract the YouTube video ID from different URL formats
    """
    match = re.search(
        r"(?:v=|youtu\.be/|youtube\.com/(?:shorts|embed|live)/)([A-Za-z0-9_-]{11})",
        url,
    )

    if not match:
        raise ValueError("Invalid YouTube URL")

    return match.group(1)


def clean_video_url(url: str) -> str:
    """
    Convert any YouTube URL to a clean watch URL
    """
    video_id = extract_video_id(url)
    return f"https://www.youtube.com/watch?v={video_id}"


def _extract_error_tail(process_result: subprocess.CompletedProcess) -> str:
    combined = "\n".join(
        part.strip()
        for part in [process_result.stderr or "", process_result.stdout or ""]
        if part
    ).strip()
    return combined[-1000:] if combined else "Unknown yt-dlp failure"


def _build_yt_dlp_strategies(output_template: str, video_url: str) -> list[list[str]]:
    # Get the Brave cookie setting from your .env if possible, 
    # or hardcode 'brave' for your local testing
    cookies_browser = os.getenv("YTDLP_COOKIES_FROM_BROWSER", "brave")

    base = [
        "yt-dlp",
        "--no-playlist",
        # 1. FIX: Use Node.js runtime correctly
        "--js-runtime", "node",
        
        # 2. FIX: Solve the n-challenge by fetching latest solvers from GitHub
        "--remote-components", "ejs:github",
        
        # 3. FIX: Use cookies from your browser to prove you are a human
        f"--cookies-from-browser={cookies_browser}",
        
        # 4. FIX: Correct formatting for extractor args
        "--extractor-args", "youtube:player_client=web;player_skip=configs",
        
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--retries", "5",
        "--fragment-retries", "5",
        "--concurrent-fragments", "1",
        "-f", "bestaudio[ext=m4a]/bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "-o", output_template,
        video_url,
    ]

    strategies: list[list[str]] = []

    # Strategy 1: Local IP + Brave Cookies (Most likely to work on your IdeaPad)
    strategies.append(base)

    # Strategy 2: Tor Proxy (Added back as a backup)
    # NOTE: We use socks5h to prevent DNS leaks
    tor_strategy = [*base, "--proxy", "socks5h://127.0.0.1:9050"]
    strategies.append(tor_strategy)

    # Strategy 3: HLS Fallback
    hls_fallback = [*base]
    try:
        format_idx = hls_fallback.index("-f")
        hls_fallback[format_idx + 1] = "91/92/93/94/140/139/bestaudio/best"
        strategies.append(hls_fallback)
    except ValueError:
        pass

    return strategies

def _download_with_yt_dlp(video_url: str, output_path: str):
    
    output_path = os.path.abspath(output_path)
    output_dir = os.path.dirname(output_path)
    # This ensures we have a clean filename without extension for the template
    output_name = os.path.splitext(os.path.basename(output_path))[0]
    os.makedirs(output_dir, exist_ok=True)

    # Use a simpler template to avoid confusion
    output_template = os.path.join(output_dir, f"{output_name}.%(ext)s")
    
    strategies = _build_yt_dlp_strategies(output_template, video_url)
    strategy_errors: list[str] = []

    for idx, command in enumerate(strategies, start=1):
        result = subprocess.run(command, capture_output=True, text=True)
        
        # Check if the expected MP3 exists now
        expected_mp3 = os.path.join(output_dir, f"{output_name}.mp3")
        
        if os.path.exists(expected_mp3):
            # If it exists but isn't named exactly what output_path wants, rename it
            if expected_mp3 != output_path:
                os.replace(expected_mp3, output_path)
            return  # SUCCESS! Exit the function

        # If it failed, log the error
        if result.returncode != 0:
            strategy_errors.append(f"strategy-{idx}: {result.stderr[-500:]}")

    raise RuntimeError(f"yt-dlp finished but {output_path} was not found.")


def download_audio(video_url: str, output_path: str):
    """
    Download audio from YouTube using yt-dlp
    """
    video_url = clean_video_url(video_url)
    output_path = os.path.abspath(output_path)

    try:
        _download_with_yt_dlp(video_url, output_path)
        return
    except Exception as error:
        print("yt-dlp download failed:", error)
        raise RuntimeError(f"Failed to download audio from YouTube: {error}") from error
