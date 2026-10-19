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
        model="openai/gpt-oss-120b",  # Groq retired the Llama 3.x models
        messages=[{"role": "user", "content": prompt}]
    )
    return resp.choices[0].message.content.strip()
