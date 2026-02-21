import json, re, os

from groq import Groq
from cache_db import get_cached_video
from services.flow_token import verify_flow_token
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def generate_video_qna(video_id: str, authorization: str | None):
    # 🔐 Step verification (must be step 2)
    payload = verify_flow_token(authorization, required_step=2)

    # Optional extra safety check
    if payload["video_id"] != video_id:
        raise HTTPException(status_code=403, detail="Video ID mismatch")

    data = get_cached_video(video_id)
    if not data:
        return {"error": "Video not processed yet"}

    prompt = f"""
Generate exactly 20 high-quality questions based on the video summary below.

DIFFICULTY DISTRIBUTION:
- 10 Easy questions (basic recall and understanding)
- 7 Medium questions (application and analysis)
- 3 Hard questions (synthesis and evaluation)

QUESTION TYPES (mix across all difficulties):
1. Multiple Choice (4 options, 1 correct)
2. Written/Descriptive (open-ended)
3. Integer/Numeric (numerical answer)
4. Code (if applicable to content)

Return ONLY valid JSON in this exact format:
{{
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "difficulty": "easy",
      "question": "Question text here?",
      "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
      "correct_answer": "B) option2",
      "explanation": "Brief explanation"
    }},
    {{
      "id": 2,
      "type": "written",
      "difficulty": "medium",
      "question": "Explain...",
      "sample_answer": "Expected answer guideline",
      "explanation": "Brief explanation"
    }},
    {{
      "id": 3,
      "type": "integer",
      "difficulty": "easy",
      "question": "How many...?",
      "correct_answer": 42,
      "explanation": "Brief explanation"
    }},
    {{
      "id": 4,
      "type": "code",
      "difficulty": "hard",
      "question": "Write code to...",
      "sample_solution": "code here",
      "explanation": "Brief explanation"
    }}
  ]
}}

Summary:
{data['summary']}
"""

    res = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": "You are an expert educator who creates high-quality assessment questions. Generate exactly 20 questions with varied types and difficulties. Return ONLY valid JSON, no markdown formatting."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.4,
        max_tokens=4000
    )

    text = res.choices[0].message.content
    match = re.search(r"\{[\s\S]*\}", text)

    if not match:
        return {"error": "Invalid JSON from model"}

    qna = json.loads(match.group())

    return {
        "qna": qna,
    }
