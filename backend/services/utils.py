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
    # Base command now includes the Tor Proxy
    base = [
        "yt-dlp",
        "--no-playlist",
        "--proxy", "socks5://127.0.0.1:9050",  # <--- TOR PROXY ADDED HERE
        "--extractor-args",
        "youtube:player_client=web",           # Use 'web' client as it's more stable over Tor
        "--extractor-args",
        "youtube:player_skip=configs",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--retries", "5",
        "--fragment-retries", "5",
        "--concurrent-fragments", "1",
        # Removed --force-ipv4 to allow Tor to manage the connection
        "-f", "bestaudio[ext=m4a]/bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "-o", output_template,
        video_url,
    ]

    strategies: list[list[str]] = []

    # Strategy 1: Tor + Cookies File (If exists) - Best chance of success
    cookies_file = os.getenv("YTDLP_COOKIES_FILE", "").strip()
    if cookies_file:
        strategies.append([
            *base[:-1],
            "--cookies", cookies_file,
            base[-1],
        ])

    # Strategy 2: Tor + Browser Cookies
    cookies_browser = os.getenv("YTDLP_COOKIES_FROM_BROWSER", "").strip()
    if cookies_browser:
        strategies.append([
            *base[:-1],
            "--cookies-from-browser", cookies_browser,
            base[-1],
        ])

    # Strategy 3: Just Tor (Default)
    strategies.append(base)

    # Strategy 4: Tor + HLS Fallback (For live streams or stubborn videos)
    hls_fallback = [*base]
    try:
        format_idx = hls_fallback.index("-f")
        hls_fallback[format_idx + 1] = "91/92/93/94/140/139/bestaudio/best"
        strategies.append(hls_fallback)
    except ValueError:
        pass

    return strategies

# def _build_yt_dlp_strategies(output_template: str, video_url: str) -> list[list[str]]:
#     base = [
#         "yt-dlp",
#         "--no-playlist",
#         "--extractor-args",
#         "youtube:player_client=default",
#         "--extractor-args",
#         "youtube:player_skip=configs",
#         "--retries",
#         "5",
#         "--fragment-retries",
#         "5",
#         "--concurrent-fragments",
#         "1",
#         "--force-ipv4",
#         "-f",
#         "bestaudio[ext=m4a]/bestaudio/best",
#         "-x",
#         "--audio-format",
#         "mp3",
#         "-o",
#         output_template,
#         video_url,
#     ]

#     strategies: list[list[str]] = []

#     cookies_file = os.getenv("YTDLP_COOKIES_FILE", "").strip()
#     if cookies_file:
#         strategies.append([
#             *base[:-1],
#             "--cookies",
#             cookies_file,
#             base[-1],
#         ])

#     cookies_browser = os.getenv("YTDLP_COOKIES_FROM_BROWSER", "").strip()
#     if cookies_browser:
#         strategies.append([
#             *base[:-1],
#             "--cookies-from-browser",
#             cookies_browser,
#             base[-1],
#         ])

#     strategies.append(base)

#     hls_fallback = [*base]
#     format_idx = hls_fallback.index("-f")
#     hls_fallback[format_idx + 1] = "91/92/93/94/140/139/bestaudio/best"
#     strategies.append(hls_fallback)

#     return strategies


def _download_with_yt_dlp(video_url: str, output_path: str):
    output_path = os.path.abspath(output_path)
    output_dir = os.path.dirname(output_path)
    output_name, _ = os.path.splitext(os.path.basename(output_path))
    os.makedirs(output_dir, exist_ok=True)

    output_template = os.path.join(output_dir, f"{output_name}.%(ext)s")
    timeout_seconds = int(os.getenv("YTDLP_TIMEOUT_SECONDS", "900"))
    strategies = _build_yt_dlp_strategies(output_template, video_url)
    strategy_errors: list[str] = []

    for idx, command in enumerate(strategies, start=1):
        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except FileNotFoundError as error:
            raise RuntimeError("yt-dlp is not installed in this environment") from error
        except subprocess.TimeoutExpired:
            strategy_errors.append(
                f"strategy-{idx}: timed out after {timeout_seconds}s"
            )
            continue

        if result.returncode != 0:
            error_tail = _extract_error_tail(result)
            strategy_errors.append(f"strategy-{idx}: {error_tail}")
            continue

        expected_mp3 = os.path.join(output_dir, f"{output_name}.mp3")

        if expected_mp3 != output_path and os.path.exists(expected_mp3):
            os.replace(expected_mp3, output_path)

        if not os.path.exists(output_path):
            candidates = glob.glob(os.path.join(output_dir, f"{output_name}.*"))
            if candidates:
                os.replace(candidates[0], output_path)

        if os.path.exists(output_path):
            return

        strategy_errors.append(
            f"strategy-{idx}: yt-dlp reported success but output file was not found"
        )

    joined_errors = "\n---\n".join(strategy_errors[-4:])
    guidance = []
    lowered = joined_errors.lower()
    if "sign in to confirm you" in lowered or "cookies-from-browser" in lowered:
        guidance.append(
            "Set YTDLP_COOKIES_FROM_BROWSER=chrome (or firefox) or YTDLP_COOKIES_FILE=/absolute/path/cookies.txt"
        )
    if "javascript runtime" in lowered:
        guidance.append("Install Node.js so yt-dlp can use a JavaScript runtime")
    if "http error 403" in lowered:
        guidance.append("Update yt-dlp in your venv: pip install -U yt-dlp")

    guidance_text = f"\nHints: {' | '.join(guidance)}" if guidance else ""
    raise RuntimeError(
        f"yt-dlp failed across strategies:\n{joined_errors}{guidance_text}"
    )


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
