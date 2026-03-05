"use client";
import React, { useEffect, useState } from 'react';
import axios from 'axios';

// Modern color palette matching the site theme
const ACCENT_PRIMARY = "#6366f1";
const TEXT_PRIMARY = "#0f172a";
const BG_PRIMARY = "#ffffff";
const BG_SECONDARY = "#f8fafc";
const BORDER_COLOR = "#e2e8f0";
const FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Icon helper component
const Icon = ({ path, className = "w-5 h-5" }: { path: React.ReactNode, className?: string }) => (
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

// Icon paths
const ICONS = {
  brain: <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v0A2.5 2.5 0 0 1 9.5 7h-3A2.5 2.5 0 0 1 4 4.5v0A2.5 2.5 0 0 1 6.5 2h3m10 0a2.5 2.5 0 0 1 2.5 2.5v0a2.5 2.5 0 0 1-2.5 2.5h-3a2.5 2.5 0 0 1-2.5-2.5v0A2.5 2.5 0 0 1 14.5 2h3M9 10.5A2.5 2.5 0 0 1 11.5 13v0a2.5 2.5 0 0 1-2.5 2.5h-1A2.5 2.5 0 0 1 5.5 13v0A2.5 2.5 0 0 1 8 10.5h1m6 0a2.5 2.5 0 0 1 2.5 2.5v0a2.5 2.5 0 0 1-2.5 2.5h-1a2.5 2.5 0 0 1-2.5-2.5v0a2.5 2.5 0 0 1 2.5-2.5h1M6.5 17A2.5 2.5 0 0 1 9 19.5v0a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 1 19.5v0A2.5 2.5 0 0 1 3.5 17h3m10 0a2.5 2.5 0 0 1 2.5 2.5v0a2.5 2.5 0 0 1-2.5 2.5h-3a2.5 2.5 0 0 1-2.5-2.5v0A2.5 2.5 0 0 1 14.5 17h3" />,
  checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>,
  xCircle: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>,
  trophy: <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M12 6v16" />,
  rotateCcw: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>,
  arrowLeft: <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
};

// --- Type Definitions matching backend response ---
interface BaseQuestion {
  id: number;
  question: string;
  type: "multiple_choice" | "written" | "integer" | "code";
  explanation: string;
  difficulty: string;
}

interface MultipleChoiceQuestion extends BaseQuestion {
  type: "multiple_choice";
  options: string[]; // ["A) option1", "B) option2", ...]
  correct_answer: string;
}

interface WrittenQuestion extends BaseQuestion {
  type: "written";
  sample_answer: string;
}

interface IntegerQuestion extends BaseQuestion {
  type: "integer";
  correct_answer: number;
}

interface CodeQuestion extends BaseQuestion {
  type: "code";
  sample_solution: string;
}

type Question = MultipleChoiceQuestion | WrittenQuestion | IntegerQuestion | CodeQuestion;

export default function QnAPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      setError("");
      try {
        const videoId = localStorage.getItem("video_id");
        const qnaToken = localStorage.getItem("qna_token");

        if (!videoId) {
            setError("Video data not found. Please return to the homepage and analyze a video first.");
            setLoading(false);
            return;
        }
        
        if (!qnaToken) {
            setError("Access token missing. Please return to content page and click QNA button again.");
            setLoading(false);
            return;
        }

        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/generate_qna?video_id=${videoId}`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${qnaToken}`
            }
          }
        );
        
        if (response.data && response.data.qna && response.data.qna.questions && response.data.qna.questions.length > 0) {
            setQuestions(response.data.qna.questions);
            
            // Store next token if provided
            if (response.data.token) {
              localStorage.setItem("next_flow_token", response.data.token);
            }
        } else {
            setError("No questions could be generated for this video. It might be too short or lack clear topics.");
        }

      } catch (err) {
        console.error("Error fetching questions:", err);
        if (axios.isAxiosError(err)) {
          const detail = err.response?.data?.detail || err.message;
          setError(`Failed to generate questions: ${detail}`);
        } else {
          setError("Failed to generate questions. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, []);

  const handleAnswerChange = (index: number, value: string) => {
    if (submitted) return;
    setUserAnswers((prev) => ({ ...prev, [index]: value }));
  };
  
  const handleSubmit = () => {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleRetake = () => {
      setUserAnswers({});
      setSubmitted(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getScore = () => {
    const scorableQuestions = questions.filter(q => q.type === "multiple_choice" || q.type === "integer");
    const correctAnswers = scorableQuestions.filter((q) => {
        const originalIndex = questions.indexOf(q);
        const userAnswer = userAnswers[originalIndex];
        if (!userAnswer) return false;
        
        if (q.type === "multiple_choice") {
          return userAnswer === q.correct_answer;
        }
        if (q.type === "integer") {
          return userAnswer.trim() === String(q.correct_answer);
        }
        return false;
    });
    return { score: correctAnswers.length, total: scorableQuestions.length };
  };

  const isCorrect = (q: Question, index: number) => {
    const userAnswer = userAnswers[index];
    if (!userAnswer) return false;
    
    if (q.type === "multiple_choice") {
      return userAnswer === q.correct_answer;
    }
    if (q.type === "integer") {
      return userAnswer.trim() === String(q.correct_answer);
    }
    // For written and code questions, we don't auto-grade
    return false;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch(difficulty.toLowerCase()) {
      case 'easy': return 'bg-green-100 text-green-700 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'hard': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const capitalizeFirst = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const formatQuestionType = (type: string) => {
    return type.split('_').map(word => capitalizeFirst(word)).join(' ');
  };

  if (loading) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          * { font-family: ${FONT_FAMILY}; }
          body { background: ${BG_SECONDARY}; color: ${TEXT_PRIMARY}; }
        `}</style>
        <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
          <div className="text-center px-4">
            <Icon path={ICONS.brain} className="w-16 h-16 text-[#6366f1] mx-auto mb-6 animate-pulse" />
            <h2 className="text-3xl font-bold tracking-tight text-[#0f172a] mb-2">Generating Your Quiz</h2>
            <p className="text-[#64748b] text-lg">Analyzing video content to create personalized questions...</p>
            <div className="mt-8 flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-[#6366f1] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-[#6366f1] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-[#6366f1] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          * { font-family: ${FONT_FAMILY}; }
          body { background: ${BG_SECONDARY}; color: ${TEXT_PRIMARY}; }
        `}</style>
        <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 sm:p-12 text-center max-w-md shadow-lg">
            <Icon path={ICONS.xCircle} className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-3 text-[#0f172a]">Something went wrong</h1>
            <p className="text-[#64748b] mb-6 leading-relaxed">{error}</p>
            <button 
              onClick={() => window.location.href = '/content'} 
              className="px-6 py-3 bg-[#6366f1] text-white text-sm font-semibold rounded-lg hover:bg-[#4f46e5] transition-colors shadow-md"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </>
    );
  }

  const { score, total } = getScore();
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { font-family: ${FONT_FAMILY}; }
        body { background: ${BG_SECONDARY}; color: ${TEXT_PRIMARY}; }
        
        .question-card {
          background: ${BG_PRIMARY};
          border-radius: 12px;
          border: 1px solid ${BORDER_COLOR};
          transition: all 0.3s ease;
        }
        
        .question-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        
        .option-btn {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        
        .option-btn:hover:not(:disabled) {
          transform: translateX(4px);
        }
        
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        .answer-input {
          transition: all 0.2s ease;
        }
        
        .answer-input:focus {
          border-color: ${ACCENT_PRIMARY};
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
      `}</style>
      
      <main className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
        {/* Header */}
        <header className="bg-white border-b border-[#e2e8f0] sticky top-0 z-50 backdrop-blur-sm bg-white/95">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={() => window.location.href = '/content'}
                className="flex-shrink-0 p-2 hover:bg-[#f8fafc] rounded-lg transition-colors"
                aria-label="Back to content"
              >
                <Icon path={ICONS.arrowLeft} className="w-5 h-5 text-[#64748b]" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0f172a] truncate">Quiz Assessment</h1>
                <p className="text-sm text-[#64748b] hidden sm:block">Test your knowledge</p>
              </div>
            </div>
            {submitted && (
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-bold text-[#6366f1]">{percentage}%</p>
                <p className="text-xs text-[#64748b]">{score}/{total} correct</p>
              </div>
            )}
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Results Card */}
          {submitted && (
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-8 mb-8 shadow-sm">
              <div className="text-center">
                <Icon path={ICONS.trophy} className="w-12 h-12 mx-auto mb-4 text-[#6366f1]" />
                <h2 className="text-3xl font-bold tracking-tight mb-2">Quiz Complete!</h2>
                <p className="text-[#64748b] text-lg mb-6">
                  {percentage >= 80 ? "Excellent work! 🎉" : percentage >= 60 ? "Good job! Keep practicing 👍" : "Keep studying and try again 📚"}
                </p>
                <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
                  <button 
                    onClick={handleRetake} 
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-[#6366f1] text-white text-sm font-semibold rounded-lg hover:bg-[#4f46e5] transition-all shadow-md hover:shadow-lg"
                  >
                    <Icon path={ICONS.rotateCcw} className="w-4 h-4" /> Retake Quiz
                  </button>
                  <button 
                    onClick={() => window.location.href = '/content'} 
                    className="w-full sm:w-auto px-6 py-3 text-sm font-semibold border border-[#e2e8f0] rounded-lg hover:bg-[#f8fafc] transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-6">
            {questions.map((q, index) => {
              const isAnswered = !!userAnswers[index];
              const questionCorrect = isCorrect(q, index);
              
              return (
                <div 
                  key={q.id} 
                  className={`question-card p-6 sm:p-8 ${
                    submitted && (q.type === "multiple_choice" || q.type === "integer")
                      ? questionCorrect 
                        ? 'border-green-300 bg-green-50/30' 
                        : isAnswered
                        ? 'border-red-300 bg-red-50/30'
                        : ''
                      : ''
                  }`}
                >
                  {/* Question Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-5 pb-4 border-b border-[#f1f5f9]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-[#0f172a]">Question {index + 1}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getDifficultyColor(q.difficulty)}`}>
                        {capitalizeFirst(q.difficulty)}
                      </span>
                      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]">
                        {formatQuestionType(q.type)}
                      </span>
                    </div>
                  </div>

                  {/* Question Text */}
                  <p className="text-lg leading-relaxed mb-6 text-[#0f172a] whitespace-pre-wrap">
                    {q.question}
                  </p>

                  {/* Multiple Choice Options */}
                  {q.type === 'multiple_choice' && (
                    <div className="space-y-3">
                      {q.options.map((option, optIdx) => {
                        const optionLetter = option.charAt(0); // "A)", "B)", etc.
                        const isSelected = userAnswers[index] === optionLetter;
                        const isCorrectOption = optionLetter === q.correct_answer.charAt(0);
                        
                        let classes = "option-btn flex items-start gap-3 p-4 border-2 rounded-lg text-left w-full ";
                        if (submitted) {
                          if (isCorrectOption) {
                            classes += "border-green-500 bg-green-50 text-green-900";
                          } else if (isSelected) {
                            classes += "border-red-500 bg-red-50 text-red-900";
                          } else {
                            classes += "border-[#e2e8f0] opacity-60";
                          }
                        } else if (isSelected) {
                          classes += "border-[#6366f1] bg-[#6366f1]/5 text-[#0f172a]";
                        } else {
                          classes += "border-[#e2e8f0] hover:border-[#6366f1] hover:bg-[#f8fafc]";
                        }

                        return (
                          <button
                            key={optIdx}
                            onClick={() => handleAnswerChange(index, optionLetter)}
                            disabled={submitted}
                            className={classes}
                          >
                            <span className="flex-shrink-0 font-bold text-lg">{optionLetter}</span>
                            <span className="flex-1 leading-relaxed">{option.substring(3)}</span>
                            {submitted && isCorrectOption && (
                              <Icon path={ICONS.checkCircle} className="flex-shrink-0 w-5 h-5 text-green-600" />
                            )}
                            {submitted && isSelected && !isCorrectOption && (
                              <Icon path={ICONS.xCircle} className="flex-shrink-0 w-5 h-5 text-red-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Integer Input */}
                  {q.type === 'integer' && (
                    <div>
                      <input
                        type="number"
                        placeholder="Enter your answer..."
                        value={userAnswers[index] || ""}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        disabled={submitted}
                        className="answer-input w-full p-4 bg-white border-2 border-[#e2e8f0] rounded-lg placeholder-[#94a3b8] focus:outline-none disabled:bg-[#f8fafc] disabled:text-[#64748b]"
                      />
                    </div>
                  )}

                  {/* Written Answer */}
                  {q.type === 'written' && (
                    <div>
                      <Icon path={ICONS.edit} className="w-5 h-5 text-[#64748b] mb-2" />
                      <textarea
                        placeholder="Type your answer here..."
                        value={userAnswers[index] || ""}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        disabled={submitted}
                        className="answer-input w-full p-4 bg-white border-2 border-[#e2e8f0] rounded-lg placeholder-[#94a3b8] focus:outline-none disabled:bg-[#f8fafc] disabled:text-[#64748b] min-h-[120px]"
                        rows={4}
                      />
                    </div>
                  )}

                  {/* Code Answer */}
                  {q.type === 'code' && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon path={ICONS.code} className="w-5 h-5 text-[#64748b]" />
                        <span className="text-sm text-[#64748b] font-medium">Write your code solution</span>
                      </div>
                      <textarea
                        placeholder="// Your code here..."
                        value={userAnswers[index] || ""}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        disabled={submitted}
                        className="answer-input w-full p-4 bg-[#0f172a] text-[#f8fafc] border-2 border-[#334155] rounded-lg placeholder-[#64748b] focus:outline-none disabled:opacity-60 font-mono text-sm min-h-[160px]"
                        rows={6}
                      />
                    </div>
                  )}

                  {/* Explanation (shown after submission) */}
                  {submitted && (
                    <div className="mt-6 pt-6 border-t border-[#e2e8f0]">
                      <h4 className="font-bold text-[#0f172a] mb-2 flex items-center gap-2">
                        <span className="text-lg">💡</span>
                        Explanation
                      </h4>
                      <p className="text-[#64748b] leading-relaxed mb-4">{q.explanation}</p>
                      
                      {/* Show correct answer for auto-graded questions */}
                      {q.type === "integer" && (
                        <div className={`p-4 rounded-lg border-2 ${questionCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                          <p className="text-sm font-bold text-[#0f172a] mb-1">Correct Answer:</p>
                          <p className="text-lg font-mono font-bold">{q.correct_answer}</p>
                        </div>
                      )}
                      
                      {/* Show sample answer for subjective questions */}
                      {q.type === "written" && (
                        <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
                          <p className="text-sm font-bold text-[#0f172a] mb-2">Sample Answer:</p>
                          <p className="text-[#475569] leading-relaxed whitespace-pre-wrap">{q.sample_answer}</p>
                        </div>
                      )}
                      
                      {q.type === "code" && (
                        <div className="p-4 rounded-lg border-2 border-blue-200 bg-[#0f172a]">
                          <p className="text-sm font-bold text-white mb-2">Sample Solution:</p>
                          <pre className="text-[#f8fafc] font-mono text-sm whitespace-pre-wrap overflow-x-auto scrollbar-thin">
                            {q.sample_solution}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit Button */}
          {!submitted && (
            <div className="mt-8 text-center">
              <button 
                onClick={handleSubmit} 
                className="w-full sm:w-auto px-12 py-4 bg-[#6366f1] text-white font-bold text-lg rounded-lg hover:bg-[#4f46e5] transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Submit Quiz
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
