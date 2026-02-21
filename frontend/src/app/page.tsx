"use client";
import React, { useState } from "react";

// Icon helper component
const Icon = ({ path, className = "w-6 h-6" }: { path: React.ReactNode, className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {path}
  </svg>
);

// Icon Paths
const ICONS = {
  youtube: (
    <>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </>
  ),
  brain: <path d="M12 2a4 4 0 0 0-4 4v1a4 4 0 0 0-3 3.87V14a4 4 0 0 0 3.8 4H8a4 4 0 0 0 8 0h-.2A4 4 0 0 0 19 14v-3.13A4 4 0 0 0 16 7V6a4 4 0 0 0-4-4z" />,
  cards: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75L19 3z" />
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75L19 15z" />
    </>
  ),
};

interface BackendError {
  detail?: string;
  error?: string;
  message?: string;
}
export default function Home() {
  const [videoLink, setVideoLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {

      //Fetch the video ID from the Youtube link
      const videoId = videoLink.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/) ||
        videoLink.match(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?]+)/);

      const Id = videoId ? videoId[1] : null;
      // Step 1: Generate token from backend
      const baseURL = "http://127.0.0.1:8000";
      const tokenResponse = await fetch(`${baseURL}/generate_token?video_id=${Id}`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
      });

      if (!tokenResponse.ok) {
        throw new Error(`Failed to generate token: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.token;

      // Step 2: Store video link and token in localStorage
      localStorage.setItem("video_link", videoLink);
      localStorage.setItem("auth_token", token);
      // Step 3: Redirect to content page
      window.location.href = `/content`;

    } catch (err: unknown) {
      console.error("Error details:", err);
      let errorMessage = "Failed to initialize session. Please try again.";

      if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setLoading(false);
    }
  };
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@700&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
        }
        
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); }
          50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); }
        }
        
        .gradient-bg {
          background: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #4facfe);
          background-size: 400% 400%;
          animation: gradient-shift 15s ease infinite;
        }
        
        .glass-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .feature-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .feature-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(139, 92, 246, 0.2);
        }
        
        .input-glow:focus {
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.3);
        }
      `}</style>
      <main className="min-h-screen w-full gradient-bg antialiased">
        {/* Floating orbs for visual interest */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="relative z-10">
          <header className="py-6 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                ✨ Vbloc
              </h1>
              <div className="flex items-center gap-2 text-white/90 text-sm font-medium">
                <Icon path={ICONS.sparkles} className="w-4 h-4" />
                <span>AI-Powered</span>d
              </div>
            </div>
          </header>

          <div className="flex flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 text-center">
            <div className="max-w-4xl w-full">
              {/* Hero Section */}
              <div className="mb-12">
                <div className="inline-block mb-4 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30">
                  <span className="text-white font-semibold text-sm">🎓 Your AI Study Companion</span>
                </div>
                <h2 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight mb-6 text-white drop-shadow-2xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Learn Smarter,
                  <br />
                  <span className="bg-gradient-to-r from-yellow-200 via-pink-200 to-purple-200 bg-clip-text text-transparent">
                    Not Harder
                  </span>
                </h2>
                <p className="max-w-2xl mx-auto text-lg sm:text-xl text-white/90 mb-12 leading-relaxed font-medium drop-shadow-lg">
                  Transform any YouTube video into interactive study materials. Get instant summaries, flashcards, and quizzes powered by AI.
                </p>
              </div>

              {/* Input Card */}
              <div className="glass-card rounded-3xl p-8 sm:p-12 shadow-2xl mb-16">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="videoLink" className="block text-left mb-3 text-gray-700 font-semibold text-sm">
                      📺 Paste Your YouTube Link
                    </label>
                    <div className="relative group">
                      <Icon path={ICONS.youtube} className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-purple-500" />
                      <input
                        id="videoLink"
                        type="text"
                        placeholder="https://youtube.com/watch?v=..."
                        value={videoLink}
                        onChange={(e) => setVideoLink(e.target.value)}
                        className="input-glow w-full pl-14 pr-5 py-5 bg-white text-gray-800 border-2 border-purple-200 rounded-2xl focus:border-purple-500 focus:outline-none text-lg placeholder:text-gray-400 transition-all duration-300 font-medium"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 text-center text-red-700 bg-red-50 border-2 border-red-200 rounded-xl">
                      <span className="font-semibold">⚠️ {error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !videoLink.trim()}
                    className="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-bold text-lg rounded-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl hover:shadow-2xl"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        <span>Analyzing Video...</span>
                      </div>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Icon path={ICONS.sparkles} className="w-5 h-5" />
                        Start Learning
                      </span>
                    )}
                  </button>
                </form>
              </div>

              {/* Features Grid */}
              <div className="mt-16">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/80 mb-10 flex items-center justify-center gap-2">
                  <Icon path={ICONS.sparkles} className="w-4 h-4" />
                  What You'll Get
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FeatureCard
                    icon={ICONS.brain}
                    title="Smart Summaries"
                    description="AI extracts key concepts and creates detailed bullet-point summaries of the entire video."
                    color="bg-purple-500"
                  />
                  <FeatureCard
                    icon={ICONS.cards}
                    title="Flashcards"
                    description="Auto-generated flashcards for effective memorization and spaced-repetition learning."
                    color="bg-pink-500"
                  />
                  <FeatureCard
                    icon={ICONS.quiz}
                    title="Practice Quizzes"
                    description="Test your knowledge with AI-generated questions and comprehensive answer explanations."
                    color="bg-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <footer className="border-t border-white/20 py-8 px-4 sm:px-6 lg:px-8 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto text-center">
              <p className="text-white/70 text-sm font-medium">
                © {new Date().getFullYear()} Vbloc • Empowering students with AI
              </p>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
}

const FeatureCard = ({ icon, title, description, color }: {
  icon: React.ReactNode,
  title: string,
  description: string,
  color: string
}) => (
  <div className="feature-card bg-white rounded-2xl p-8 text-left shadow-lg hover:shadow-xl">
    <div className={`inline-flex p-3 ${color} rounded-xl mb-4 shadow-lg`}>
      <Icon path={icon} className="w-7 h-7 text-white" />
    </div>
    <h3 className="text-xl font-bold mb-3 text-gray-800">{title}</h3>
    <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
  </div>
);
