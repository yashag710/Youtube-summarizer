import json, os

from groq import Groq, APIError
from cache_db import get_cached_video
from services.flow_token import verify_flow_token
from services.utils import normalize_mcq
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

For multiple_choice: "options" are 4 plain-text strings with NO "A)"/"B)" labels,
and "correct_index" is the 0-based position of the correct option (0-3).

Return ONLY valid JSON in this exact format:
{{
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "difficulty": "easy",
      "question": "Question text here?",
      "options": ["option1", "option2", "option3", "option4"],
      "correct_index": 1,
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

    # JSON mode makes Groq reject malformed output (e.g. bad escaping); it's intermittent,
    # so one retry usually succeeds
    for attempt in range(2):
        try:
            res = client.chat.completions.create(
                model="openai/gpt-oss-120b",  # Groq retired the Llama 3.x models
                messages=[
                    {"role": "system", "content": "You are an expert educator who creates high-quality assessment questions. Generate exactly 20 questions with varied types and difficulties. Return ONLY valid JSON, no markdown formatting."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                max_tokens=4000,
                response_format={"type": "json_object"}
            )
            qna = json.loads(res.choices[0].message.content)
            break
        except (APIError, json.JSONDecodeError) as e:
            # Full error (it can include the whole failed generation) stays in the server log
            print(f"Quiz generation attempt {attempt + 1} failed: {e}")
    else:
        raise HTTPException(status_code=502, detail="The quiz couldn't be generated. Try again in a moment.")

    questions = []
    for q in qna.get("questions", []):
        if not isinstance(q, dict):
            continue
        if q.get("type") == "multiple_choice":
            q = normalize_mcq(q)
            if q is None:
                continue  # unrepairable: drop it rather than show a wrong answer key
        questions.append(q)

    return {
        "qna": {"questions": questions},
    }
