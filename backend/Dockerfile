# Use Python 3.11 slim image as base
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies (Adding 'tor' and 'curl' for the healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    tor \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download NLTK data
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('stopwords')"

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# --- NEW STARTUP LOGIC ---
# We create a simple shell script to start Tor as a background service 
# before launching the Uvicorn server.
RUN echo "#!/bin/bash\nservice tor start\nexec uvicorn main:app --host 0.0.0.0 --port 8000" > /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Health check (Ensure curl is installed in the RUN block above)
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=5 \
CMD curl -f http://localhost:8000/docs || exit 1

# Launch using the entrypoint script
CMD ["/app/entrypoint.sh"]