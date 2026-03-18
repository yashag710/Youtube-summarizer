"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios, { AxiosError } from "axios";
import Chatbot from "./components/chatbot";

// Modern, clean color palette
const ACCENT_PRIMARY = "#6366f1";
const TEXT_PRIMARY = "#0f172a";
const BG_PRIMARY = "#ffffff";
const BG_SECONDARY = "#f8fafc";
const BORDER_COLOR = "#e2e8f0";
const FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// --- Type Definitions ---
interface Topic {
  topic: string;
  detailed_points: string[];
}

interface AnalyzeResponse {
  video_id: string;
  summary: string;
  topics: Topic[];
  transcript: string;
}

interface BackendError {
    detail?: string;
    error?: string;
    message?: string;
}

export default function VideoAssistantPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [transcript, setTranscript] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const initialFetchTriggeredRef = useRef(false);
  const requestInFlightRef = useRef(false);
  
  useEffect(() => {
    setHasMounted(true);
  }, []);
  
  const fetchData = useCallback(async (isRetry = false) => {
    if (!hasMounted) return;
    if (requestInFlightRef.current) return;
    
    const videoLink = localStorage.getItem("video_link");
    const token = localStorage.getItem("auth_token");
    
    if (!videoLink) {
      setError("Missing video link. Please go back and select a video.");
      setLoading(false);
      return;
    }

    if (!token) {
      setError("Missing session token. Please go back and submit the video again.");
      setLoading(false);
      return;
    }
    
    try {
      // Always set loading and clear error when starting fetch
      setLoading(true);
      setError(null);
      requestInFlightRef.current = true;
      if (!isRetry) {
        setRetryCount(0);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const apiClient = axios.create({
        timeout: 300000, // Increased to 5 minutes for longer videos
        baseURL: process.env.NEXT_PUBLIC_API_URL,
        headers
      });

      const response = await apiClient.post<AnalyzeResponse>("/analyze", {
        video_link: videoLink
      });

      const data = response.data;
      
      // Store video_id for other features
      if (data.video_id) {
        localStorage.setItem("video_id", data.video_id);
      }
      
      setTopics(data.topics || []);
      setTranscript(data.transcript || "");
      
      // Clear error on successful response
      setError(null);

    } catch (err: unknown) {
      console.error("Error fetching data:", err);
      
      let errorMessage = "An unexpected error occurred. ";
      let canRetry = false;
      
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError<BackendError>;
        if (axiosError.response) {
            const { status, data } = axiosError.response;
            const detail = data?.detail || data?.error || "Unknown server error";
            errorMessage = `Server Error (${status}): ${detail}`;
            canRetry = status >= 500;
        } else if (axiosError.request) {
            errorMessage = "Cannot connect to the server. Please ensure the backend is running and accessible.";
            canRetry = true;
        } else {
            errorMessage = axiosError.message;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
        canRetry = true;
      }
      
      setError(errorMessage);
      
      if (canRetry && retryCount < 2) {
        const nextRetry = retryCount + 1;
        console.log(`Retrying... Attempt ${nextRetry}`);
        setRetryCount(nextRetry);
        setTimeout(() => fetchData(true), 2000 * nextRetry);
      }
      
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }, [hasMounted, retryCount]);

  useEffect(() => {
    if (!hasMounted || initialFetchTriggeredRef.current) return;
    initialFetchTriggeredRef.current = true;
    fetchData();
  }, [hasMounted, fetchData]);

  if (!hasMounted) {
    return null;
  }

  const handleRetry = () => {
    fetchData(false);
  };
  
  const handleQnA = async () => {
    try {
      const videoId = localStorage.getItem("video_id");
      
      if (!videoId) {
        alert("Video ID not found. Please refresh the page.");
        return;
      }
      
      // Generate step 2 token for QNA flow
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/generate_token?video_id=${videoId}&step=2`);
      const { token } = response.data;
      
      // Store token for QNA page
      localStorage.setItem("qna_token", token);
      
      // Redirect to QNA page
      window.location.href = '/qna';
    } catch (error) {
      console.error("Error generating QNA token:", error);
      alert("Failed to start QNA. Please try again.");
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
          font-family: ${FONT_FAMILY};
        }
        
        body { 
          background: ${BG_SECONDARY};
          color: ${TEXT_PRIMARY};
        }
        
        .content-card {
          background: ${BG_PRIMARY};
          border-radius: 12px;
          border: 1px solid ${BORDER_COLOR};
          transition: all 0.2s ease;
        }
        
        .content-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        
        .topic-sidebar-card {
          background: ${BG_PRIMARY};
          border-radius: 10px;
          border: 1px solid ${BORDER_COLOR};
          transition: all 0.2s ease;
          text-decoration: none;
        }
        
        .topic-sidebar-card:hover {
          border-color: ${ACCENT_PRIMARY};
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
          transform: translateY(-1px);
        }
        
        .section-title {
          color: ${TEXT_PRIMARY};
          font-weight: 700;
        }
        
        .topic-heading {
          color: ${ACCENT_PRIMARY};
          font-weight: 700;
        }
        
        .header-bar {
          background: ${BG_PRIMARY};
          border-bottom: 1px solid ${BORDER_COLOR};
          backdrop-filter: blur(8px);
        }
        
        .primary-btn {
          background: ${ACCENT_PRIMARY};
          color: white;
          border-radius: 8px;
          font-weight: 600;
          transition: all 0.2s ease;
          border: none;
          font-size: 0.875rem;
        }
        
        .primary-btn:hover:not(:disabled) {
          background: #4f46e5;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        
        .primary-btn:disabled {
          background: #cbd5e1;
          color: #94a3b8;
          cursor: not-allowed;
        }
        
        .error-card {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
          border-radius: 12px;
        }
        
        .action-btn {
          padding: 0.875rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.875rem;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        
        .action-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .action-btn-primary {
          background: ${ACCENT_PRIMARY};
          color: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .action-btn-primary:hover:not(:disabled) {
          background: #4f46e5;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        
        .action-btn-secondary {
          background: white;
          color: ${ACCENT_PRIMARY};
          border: 1.5px solid ${BORDER_COLOR};
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        
        .action-btn-secondary:hover:not(:disabled) {
          border-color: ${ACCENT_PRIMARY};
          background: #f8fafc;
        }
        
        .scrollbar-thin::-webkit-scrollbar { 
          width: 6px; 
        }
        .scrollbar-thin::-webkit-scrollbar-track { 
          background: transparent; 
        }
        .scrollbar-thin::-webkit-scrollbar-thumb { 
          background: #cbd5e1; 
          border-radius: 3px; 
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { 
          background: #94a3b8; 
        }
        
        .topic-number {
          color: ${ACCENT_PRIMARY};
          opacity: 0.3;
          font-weight: 800;
        }
        
        .divider {
          border: none;
          border-top: 1px solid ${BORDER_COLOR};
          margin: 1.5rem 0;
        }
      `}</style>
      <main className="min-h-screen w-full bg-[#f8fafc] text-[#0f172a] flex flex-col">
        <header className="py-5 px-4 sm:px-6 lg:px-8 header-bar flex-shrink-0 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Video Learning</h1>
              <p className="text-[#64748b] text-sm mt-0.5">Comprehensive content breakdown</p>
            </div>
            <button onClick={() => window.location.href = '/'} className="primary-btn px-6 py-2.5">
              New Video
            </button>
          </div>
        </header>

        <div className="flex-1 flex max-w-7xl mx-auto w-full overflow-hidden gap-6 py-6 px-4 md:px-8">
          <section className="flex-1 flex flex-col min-w-0">
            <div className="mb-6">
              <h2 className="text-xl font-semibold section-title mb-1">Content Overview</h2>
              <p className="text-[#64748b] text-sm">Detailed breakdown of key topics</p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-5 scrollbar-thin pr-2">
              {loading && (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-3 border-[#e2e8f0] border-t-[#6366f1] mb-4"></div>
                  <p className="font-semibold text-base text-[#0f172a]">Processing video...</p>
                  <p className="text-[#64748b] text-sm mt-1">This may take a moment</p>
                  {retryCount > 0 && <p className="text-[#6366f1] font-medium text-sm mt-2">Retry attempt {retryCount}/2</p>}
                </div>
              )}
              {error && (
                <div className="h-full flex items-center justify-center">
                    <div className="error-card p-8 text-center max-w-md">
                        <div className="text-3xl mb-3">⚠</div>
                        <h3 className="font-semibold text-lg mb-2">Error Loading Content</h3>
                        <p className="mb-5 text-sm text-[#991b1b]">{error}</p>
                        <div className="flex gap-2 justify-center">
                            <button onClick={handleRetry} className="primary-btn px-5 py-2">Retry</button>
                            <button 
                              onClick={() => window.location.href = '/'} 
                              className="px-5 py-2 border border-[#e2e8f0] rounded-lg text-sm font-medium hover:bg-[#f8fafc] transition-colors"
                            >
                              Go Back
                            </button>
                        </div>
                    </div>
                </div>
              )}
              {!loading && !error && topics?.length > 0 && (
                <div className="space-y-5">
                  {topics.map((topic, index) => (
                    <div key={index} id={`topic-${index}`} className="content-card p-8 scroll-mt-24">
                      <div className="flex items-start gap-4 mb-6 pb-4 border-b border-[#f1f5f9]">
                        <span className="text-2xl font-black topic-number text-[#6366f1] mt-1">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="text-xl font-semibold topic-heading leading-snug flex-1">
                          {topic.topic}
                        </h3>
                      </div>
                      
                      {topic.detailed_points?.length > 0 && (
                        <div className="space-y-4 pl-1">
                          {topic.detailed_points.map((point: string, pointIndex: number) => (
                            <p key={pointIndex} className="text-[15px] text-[#475569] leading-relaxed text-justify">
                              {point}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {transcript && (
                    <div className="content-card p-6">
                      <details className="group">
                        <summary className="cursor-pointer font-semibold text-base text-[#0f172a] mb-3 list-none flex items-center gap-2 hover:text-[#6366f1] transition-colors">
                          <span className="transform transition-transform group-open:rotate-90 text-[#6366f1]">▶</span>
                          Full Transcript
                        </summary>
                        <div className="mt-4 text-[#475569] leading-relaxed text-sm max-h-96 overflow-y-auto scrollbar-thin p-4 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
                          {transcript}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}
              {!loading && !error && !topics?.length && (
                 <div className="h-full flex items-center justify-center">
                    <div className="error-card p-8 text-center">
                        <div className="text-3xl mb-3">📭</div>
                        <h3 className="font-semibold text-lg mb-2">No Content Available</h3>
                        <p className="mb-5 text-sm">Unable to generate content for this video</p>
                        <button onClick={handleRetry} className="primary-btn px-5 py-2">Try Again</button>
                    </div>
                </div>
              )}
            </div>
          </section>

          <div className="hidden lg:block w-px bg-[#e2e8f0] self-stretch"></div>

          <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col">
            <div className="mb-6">
              <h2 className="text-xl font-semibold section-title mb-1">Topics</h2>
              <p className="text-[#64748b] text-sm">Quick navigation</p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin pr-2">
              {topics?.length > 0 ? (
                <div className="space-y-2.5">
                  {topics.map((topic, index) => (
                    <a 
                      key={index} 
                      href={`#topic-${index}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(`topic-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="topic-sidebar-card p-4 block"
                    >
                      <h3 className="font-semibold text-sm flex items-start gap-2.5 text-[#0f172a]">
                        <span className="text-[#6366f1] opacity-50 font-bold">{String(index + 1).padStart(2, '0')}</span>
                        <span className="leading-snug">{topic.topic}</span>
                      </h3>
                      {topic.detailed_points?.length > 0 && (
                        <div className="mt-2.5 pl-7 space-y-1.5">
                          {topic.detailed_points.slice(0, 2).map((point: string, subIndex: number) => (
                            <p key={subIndex} className="text-[#64748b] text-xs leading-relaxed line-clamp-1">
                              {point}
                            </p>
                          ))}
                          {topic.detailed_points.length > 2 && (
                            <p className="text-[#6366f1] text-xs font-medium">+{topic.detailed_points.length - 2} more</p>
                          )}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                !loading && (
                  <div className="text-center py-12 text-[#94a3b8]">
                    <p className="text-2xl mb-2">📋</p>
                    <p className="text-sm">{error ? "Topics unavailable" : "No topics found"}</p>
                  </div>
                )
              )}
            </div>
            
            <hr className="divider" />
            
            <div className="flex gap-2.5">
                <button 
                  onClick={() => handleQnA()} 
                  disabled={loading || !!error}
                  className="action-btn action-btn-primary flex-1"
                >
                  Q&A
                </button>
                <button 
                  onClick={() => window.location.href = '/notes'} 
                  disabled={loading || !!error}
                  className="action-btn action-btn-secondary flex-1"
                >
                  Notes
                </button>
            </div>
          </aside>
        </div>

        {/* Chatbot Component */}
        <Chatbot accentPurple={ACCENT_PRIMARY} />
      </main>
    </>
  );
}
