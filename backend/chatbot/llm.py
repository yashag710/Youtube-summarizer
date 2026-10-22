from groq import Groq
from dotenv import load_dotenv

import os

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def llm_answer(query: str, summary: str, excerpts: str):
    prompt = f"""
You help a student study one video, using the video summary and transcript excerpts below.
- Questions about the video's subject: answer from the video. You may explain it more simply or
  give examples to illustrate what the video teaches, but say when something isn't from the video.
- Questions unrelated to the video's subject: say the video doesn't cover it, and don't answer.
Keep the answer concise.
---
Video summary: {summary or "(none)"}
---
Transcript excerpts: {excerpts or "(none)"}
---
Question: {query}
Answer:
"""
    resp = client.chat.completions.create(
        model="openai/gpt-oss-120b",  # Groq retired the Llama 3.x models
        messages=[{"role": "user", "content": prompt}]
    )
    return resp.choices[0].message.content.strip()
