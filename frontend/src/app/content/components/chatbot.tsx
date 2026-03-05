"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import axios, { AxiosError } from "axios";

// Type Definitions
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BackendError {
  detail?: string;
  error?: string;
  message?: string;
}

interface ChatbotProps {
  accentPurple?: string;
}

// Icon helper
const Icon = ({ path, className = "w-5 h-5", style }: { path: React.ReactNode, className?: string, style?: React.CSSProperties }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {path}
  </svg>
);

// Icon paths
const ICONS = {
  bot: <><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></>,
  loader: <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="m22 2-11 11" /></>,
  messageCircle: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  alertCircle: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
};

export default function Chatbot({ accentPurple = "#764ba2" }: ChatbotProps) {
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showChatbot) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, showChatbot]);

  const handleChatAsk = useCallback(async () => {
    if (!chatQuestion.trim() || chatLoading) return;

    const videoId = localStorage.getItem("video_id");
    if (!videoId) {
      setChatError("Video ID not available. Please reload the page.");
      return;
    }

    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: chatQuestion }];
    setChatHistory(newHistory);
    const currentQuestion = chatQuestion;
    setChatQuestion('');
    setChatLoading(true);
    setChatError('');

    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/query`, {
        params: { 
          query: currentQuestion,
          video_id: videoId
        }
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.data.response
      };
      setChatHistory(prev => [...prev, assistantMessage]);

    } catch (err: unknown) {
      let errorMessage = 'An unknown error occurred. Please try again.';
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError<BackendError>;
        if (axiosError.response) {
          errorMessage = `Server Error (${axiosError.response.status}): ${axiosError.response.data?.detail || "Please try again."}`;
        } else if (axiosError.request) {
          errorMessage = "Cannot connect to the server. Please ensure the backend is running.";
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setChatError(errorMessage);
      setChatHistory(chatHistory);
    } finally {
      setChatLoading(false);
    }
  }, [chatQuestion, chatLoading, chatHistory]);

  const handleChatKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatAsk();
    }
  };

  return (
    <>
      <style>{`
        .chatbot-float-btn {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: ${accentPurple};
          color: white;
          border: none;
          box-shadow: 0 4px 20px rgba(118, 75, 162, 0.3);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          z-index: 1000;
        }
        .chatbot-float-btn:hover {
          transform: translateY(-4px) scale(1.08);
          box-shadow: 0 8px 28px rgba(118, 75, 162, 0.4);
          background: #5e3a82;
        }
        .chatbot-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 550px;
          max-width: 90vw;
          z-index: 2000;
          transform: translateX(100%);
          transition: transform 0.3s ease-in-out;
        }
        .chatbot-panel.open {
          transform: translateX(0);
        }
        .chatbot-container {
          background: white;
          height: 100%;
          display: flex;
          flex-direction: column;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
          border-left: 2px solid #f0e6ff;
        }
        .chatbot-header {
          background: ${accentPurple};
          color: white;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #f0e6ff;
        }
        .chatbot-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          background: #f9f7ff;
        }
        .chatbot-input-area {
          padding: 1.5rem;
          background: white;
          border-top: 1px solid #f0e6ff;
        }
        .chat-message-user {
          background: ${accentPurple};
          color: white;
          border-radius: 1.2rem 1.2rem 0.3rem 1.2rem;
          padding: 1rem 1.2rem;
          margin-left: auto;
          max-width: 80%;
          box-shadow: 0 2px 8px rgba(118, 75, 162, 0.2);
        }
        .chat-message-bot {
          background: white;
          color: #18122B;
          border-radius: 1.2rem 1.2rem 1.2rem 0.3rem;
          padding: 1rem 1.2rem;
          margin-right: auto;
          max-width: 80%;
          border: 1px solid #f0e6ff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
        }
        .chatbot-scrollbar::-webkit-scrollbar { width: 6px; }
        .chatbot-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .chatbot-scrollbar::-webkit-scrollbar-thumb { background: #d4d4d4; border-radius: 3px; }
        .chatbot-scrollbar::-webkit-scrollbar-thumb:hover { background: #a3a3a3; }
      `}</style>

      {/* Floating Chatbot Button */}
      <button
        onClick={() => setShowChatbot(true)}
        className="chatbot-float-btn"
        aria-label="Open Chatbot"
      >
        <Icon path={ICONS.messageCircle} className="w-7 h-7" />
      </button>

      {/* Chatbot Side Panel */}
      <div className={`chatbot-panel ${showChatbot ? 'open' : ''}`}>
        <div className="chatbot-container">
          {/* Header */}
          <div className="chatbot-header">
            <div className="flex items-center gap-3">
              <Icon path={ICONS.bot} className="w-6 h-6" />
              <div>
                <h2 className="font-bold text-lg">Video Assistant</h2>
                <p className="text-sm opacity-90">Ask me anything about this video</p>
              </div>
            </div>
            <button
              onClick={() => setShowChatbot(false)}
              className="hover:bg-white/20 p-2 rounded-full transition-colors"
              aria-label="Close Chatbot"
            >
              <Icon path={ICONS.x} className="w-6 h-6" />
            </button>
          </div>

          {/* Messages */}
          <div className="chatbot-messages chatbot-scrollbar">
            {chatHistory.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <Icon path={ICONS.messageCircle} className="w-12 h-12 mx-auto mb-4 opacity-30" style={{ stroke: accentPurple }} />
                  <p className="text-black/80 text-lg font-bold mb-1">Start a Conversation</p>
                  <p className="text-black/50 text-sm">Ask me anything about the video content</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={msg.role === 'user' ? 'chat-message-user' : 'chat-message-bot'}>
                      <p className="leading-relaxed whitespace-pre-wrap text-sm">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="chat-message-bot">
                      <Icon path={ICONS.loader} className="w-5 h-5 animate-spin" style={{ stroke: accentPurple }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="chatbot-input-area">
            {chatError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <Icon path={ICONS.alertCircle} className="w-4 h-4 flex-shrink-0" />
                <p>{chatError}</p>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                placeholder="Ask a question..."
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                onKeyPress={handleChatKeyPress}
                className="flex-1 p-3 border-2 rounded-lg text-sm resize-none focus:outline-none transition-colors"
                style={{ borderColor: accentPurple }}
                rows={2}
                disabled={chatLoading}
              />
              <button
                onClick={handleChatAsk}
                disabled={chatLoading || !chatQuestion.trim()}
                className="px-5 rounded-lg font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: accentPurple }}
              >
                {chatLoading ? <Icon path={ICONS.loader} className="w-5 h-5 animate-spin" /> : <Icon path={ICONS.send} />}
              </button>
            </div>
            <div className="mt-2 text-xs text-black/40 flex justify-between">
              <span>Press Enter to send, Shift+Enter for new line</span>
              <button
                onClick={() => setChatHistory([])}
                disabled={chatHistory.length === 0 || chatLoading}
                className="hover:underline disabled:text-black/20 disabled:no-underline"
              >
                Clear Chat
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
