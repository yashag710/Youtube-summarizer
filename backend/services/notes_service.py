import json, re, os

from groq import Groq
from cache_db import get_cached_video
from services.flow_token import verify_flow_token
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def generate_video_notes(video_id: str):
    data = get_cached_video(video_id)
    if not data:
        raise HTTPException(status_code=404, detail="Video not processed yet")

    summary = data.get("summary")
    topics = data.get("topics", [])
    
    if not summary:
        raise HTTPException(status_code=400, detail="Summary not available")

    prompt = f"""
You are an expert academic note-taker.

Convert the following lecture summary and topics into well-structured study notes.

Guidelines:
- Use clear section headings
- Use bullet points where appropriate
- Keep explanations concise and precise
- Maintain a logical flow of ideas
- Do NOT add new information
- Write in a neutral, academic tone

Structure:
1. Overview/Introduction
2. Key Topics (expand on each)
3. Important Details
4. Key Takeaways

Lecture Summary:
{summary}

Topics Covered:
{json.dumps(topics, indent=2)}
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You generate structured academic notes in clear sections."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2
        )

        notes_text = response.choices[0].message.content.strip()
        
        # Parse the notes into structured sections for pagination
        sections = parse_notes_into_sections(notes_text)

        return {
            "video_id": video_id,
            "notes": notes_text,
            "sections": sections,
            "total_sections": len(sections)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate notes: {str(e)}")

def parse_notes_into_sections(notes_text: str):
    """Parse markdown notes into pageable sections"""
    sections = []
    lines = notes_text.split('\n')
    current_section = {"title": "", "content": []}
    
    for line in lines:
        # Check if line is a heading (starts with #)
        if line.startswith('#'):
            # Save previous section if it has content
            if current_section["title"] or current_section["content"]:
                sections.append({
                    "title": current_section["title"],
                    "content": '\n'.join(current_section["content"]).strip()
                })
            
            # Start new section
            current_section = {
                "title": line.lstrip('#').strip(),
                "content": []
            }
        else:
            # Add content to current section
            if line.strip():
                current_section["content"].append(line)
    
    # Add the last section
    if current_section["title"] or current_section["content"]:
        sections.append({
            "title": current_section["title"],
            "content": '\n'.join(current_section["content"]).strip()
        })
    
    return sections
