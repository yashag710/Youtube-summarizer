from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.text_rank import TextRankSummarizer
from transformers import pipeline

offline_summarizer = pipeline(
    "text2text-generation",
    model="facebook/bart-large-cnn"
)

def extractive_summary(text, count):
    try:
        parser = PlaintextParser.from_string(text, Tokenizer("english"))
        summary = TextRankSummarizer()(parser.document, count)
        return " ".join(str(s) for s in summary)
    except Exception as e:
        print(f"Error in extractive summary: {e}")
        return text[:5000] # Fallback

def rewrite_offline(text, mode="main"):
    try:
        # Chunking for long text if necessary, but simple approach first
        chunk_size = 1024
        chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]
        
        final_summary = []
        for chunk in chunks[:3]: # Limit to first few chunks to save time/memory if very long
            min_len, max_len = (60,130) if mode=="main" else (150,320)
            result = offline_summarizer(
                chunk, max_length=max_len, min_length=min_len, do_sample=False
            )
            output_item = result[0] if result else {}
            generated_text = (
                output_item.get("summary_text")
                or output_item.get("generated_text")
                or ""
            )

            if generated_text:
                final_summary.append(generated_text.strip())
        
        if final_summary:
            return " ".join(final_summary)

        return text[:500]
    except Exception as e:
        print(f"Error in rewriting: {e}")
        return text[:500]

def generate_topics_offline(transcript):
    # Heuristic: Split transcript into roughly 3 parts and summarize each as a topic
    # This is a naive implementation as requested to use the offline model
    length = len(transcript)
    part_len = length // 3
    topics = []
    
    for i in range(3):
        start = i * part_len
        end = (i + 1) * part_len if i < 2 else length
        chunk = transcript[start:end]
        if not chunk.strip(): continue
        
        # Summarize the chunk to get a "Topic Description"
        summary = rewrite_offline(chunk, mode="main")
        # Use first sentence as title roughly
        title = summary.split('.')[0]
        if len(title) > 50: title = title[:47] + "..."
        
        topics.append({
            "topic": title,
            "subtopics": [summary] # Using summary as subtopic detail
        })
        
    return topics

def split_into_points(text):
    """Split text into logical points/paragraphs instead of individual sentences"""
    import nltk
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt')
        
    from nltk.tokenize import sent_tokenize
    sentences = sent_tokenize(text)
    
    # Group sentences into logical paragraphs (2-3 sentences per point)
    points = []
    i = 0
    while i < len(sentences):
        # Take 2-3 sentences per point for better paragraph structure
        group_size = min(3, len(sentences) - i)
        if group_size == 1 and len(sentences[i]) < 100 and i + 1 < len(sentences):
            # If sentence is short, combine with next
            group_size = 2
        
        point = " ".join(sentences[i:i+group_size])
        points.append(point)
        i += group_size
    
    return points if points else [text]
