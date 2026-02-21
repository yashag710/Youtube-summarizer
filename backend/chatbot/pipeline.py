from chatbot.rag import search
from chatbot.llm import llm_answer

def chatbot_response(question: str):
    context = search(question)

    # Context check — if transcript doesn't contain answer
    if len(context.strip()) < 50:
        return llm_answer(question)  # open knowledge
    
    # RAG-enhanced answer
    return llm_answer(question, context)
