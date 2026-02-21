from groq import Groq
from dotenv import load_dotenv

import os

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def llm_answer(query: str, context: str = ""):
    prompt = f"""
Use the context below only if relevant.
If not enough information, answer using your own knowledge.
---
Context: {context}
---
Question: {query}
Answer:
"""
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )
    return resp.choices[0].message.content.strip()
