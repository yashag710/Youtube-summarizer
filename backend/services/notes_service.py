import json, re, os

from groq import Groq
from cache_db import get_cached_video, get_generated, save_generated
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def generate_video_notes(video_id: str, refresh: bool = False):
    data = get_cached_video(video_id)
    if not data:
        raise HTTPException(status_code=404, detail="Video not processed yet")

    # Same notes for everyone until someone asks for a rewrite, so revisits don't cost a Groq call
    cached = None if refresh else get_generated(video_id, "notes")
    if cached:
        return cached

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
- Start every section with a Markdown "## " heading (not bold text)

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
            model="openai/gpt-oss-20b",  # Groq retired the Llama 3.x models
            messages=[
                {"role": "system", "content": "You generate structured academic notes in clear sections."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2
        )

        notes_text = response.choices[0].message.content.strip()
        
        # Parse the notes into structured sections for pagination
        sections = parse_notes_into_sections(notes_text)

        result = {
            "video_id": video_id,
            "notes": notes_text,
            "sections": sections,
            "total_sections": len(sections)
        }
        if sections:
            save_generated(video_id, "notes", result)
        return result

    except Exception as e:
        print(f"ERROR in generate_video_notes: {e}")
        raise HTTPException(status_code=502, detail="The notes couldn't be generated. Try again in a moment.")

def parse_notes_into_sections(notes_text: str):
    """Parse markdown notes into pageable sections"""
    sections = []
    lines = notes_text.split('\n')
    current_section = {"title": "", "content": []}
    
    for line in lines:
        # A heading is a "#" line, or a line that is entirely bold ("**Key Topics**"),
        # which some models use instead
        bold_heading = re.fullmatch(r"\s*\*\*([^*]+)\*\*:?\s*", line)
        if bold_heading:
            line = "# " + bold_heading.group(1).strip().rstrip(":")
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
