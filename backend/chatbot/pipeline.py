from chatbot.rag import search
from chatbot.llm import llm_answer

def chatbot_response(question: str, chunks: list[str], embeddings, summary: str = ""):
    # The summary lets overview questions ("what is this video about?") work even when
    # the retrieved chunks only cover a few moments of the video
    excerpts = search(question, chunks, embeddings)
    return llm_answer(question, summary, excerpts)
