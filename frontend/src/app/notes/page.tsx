"use client";
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import NotesCanvas from './components/canvas';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Modern color palette matching the site theme
const ACCENT_PRIMARY = "#6366f1";
const ACCENT_SECONDARY = "#8b5cf6";
const TEXT_PRIMARY = "#0f172a";
const TEXT_SECONDARY = "#475569";
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
  arrowLeft: <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  fileText: <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
  checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>,
  loader: <><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></>,
  sparkles: <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75L19 3z" /></>,
};

interface NoteSection {
  title: string;
  content: string;
}

export default function NotesPage() {
  const [sections, setSections] = useState<NoteSection[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'markdown' | 'plain' | 'pdf'>('markdown');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      setError("");
      
      try {
        const videoId = localStorage.getItem("video_id");

        // Fetch notes from backend
        const response = await axios.post(`http://localhost:8000/notes?video_id=${videoId}`);
        
        if (response.data) {
          setSections(response.data.sections || []);
        }
      } catch (err) {
        console.error("Error fetching notes:", err);
        // Silently handle errors to show UI
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, []);

  const formatNotesAsMarkdown = () => {
    let markdown = `# Study Notes\n\n`;
    
    sections.forEach((section, index) => {
      markdown += `## ${section.title}\n\n`;
      markdown += `${section.content}\n\n`;
    });
    
    return markdown;
  };

  const formatNotesAsPlainText = () => {
    let text = `STUDY NOTES\n${'='.repeat(50)}\n\n`;
    
    sections.forEach((section, index) => {
      text += `${section.title.toUpperCase()}\n${'-'.repeat(50)}\n`;
      text += `${section.content}\n\n`;
    });
    
    return text;
  };

  const handleCopy = async () => {
    const content = selectedFormat === 'markdown' ? formatNotesAsMarkdown() : formatNotesAsPlainText();
    
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = async () => {
    if (selectedFormat === 'pdf') {
      await handlePDFDownload();
    } else {
      const content = selectedFormat === 'markdown' ? formatNotesAsMarkdown() : formatNotesAsPlainText();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-notes.${selectedFormat === 'markdown' ? 'md' : 'txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handlePDFDownload = async () => {
    setDownloading(true);
    
    if (!sections || sections.length === 0) {
      alert('No notes available to export as PDF.');
      setDownloading(false);
      return;
    }
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      for (let i = 0; i < sections.length; i++) {
        // 1. Change the page in the UI
        setCurrentPage(i);
        
        // 2. WAIT: Give React time to render the new content into the DOM
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // 3. Capture the element
        const element = document.getElementById(`page-${i}`);
        
        if (!element) {
          console.error(`Element page-${i} not found in DOM`);
          throw new Error(`Failed to find page ${i + 1} in the document`);
        }
        
        console.log(`Capturing page ${i + 1}/${sections.length}...`);
        
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: true,
          backgroundColor: '#ffffff',
          allowTaint: true,
          removeContainer: false,
        });
        
        const imgData = canvas.toDataURL('image/png');
        
        // Calculate width/height to fit PDF
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        if (i > 0) pdf.addPage();
        
        // Add image to PDF
        pdf.addImage(
          imgData, 
          'PNG', 
          0, 
          0, 
          imgWidth, 
          imgHeight > pdfHeight ? pdfHeight : imgHeight
        );
      }
      
      pdf.save('YouTube_Study_Notes.pdf');
      console.log('PDF generated successfully');
    } catch (error) {
      console.error('PDF Generation Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to generate PDF: ${errorMessage}\n\nPlease check the console for more details.`);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          * { font-family: ${FONT_FAMILY}; }
          body { background: ${BG_SECONDARY}; color: ${TEXT_PRIMARY}; margin: 0; }
        `}</style>
        <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
          <div className="text-center px-4">
            <Icon path={ICONS.loader} className="w-16 h-16 text-[#6366f1] mx-auto mb-6 animate-spin" />
            <h2 className="text-3xl font-bold tracking-tight text-[#0f172a] mb-2">Loading Notes</h2>
            <p className="text-[#64748b] text-lg">Preparing your study materials...</p>
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
          body { background: ${BG_SECONDARY}; color: ${TEXT_PRIMARY}; margin: 0; }
        `}</style>
        <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 sm:p-12 text-center max-w-md shadow-lg">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="text-2xl font-bold mb-3 text-[#0f172a]">Unable to Load Notes</h1>
            <p className="text-[#64748b] mb-6 leading-relaxed">{error}</p>
            <button 
              onClick={() => window.location.href = '/content'} 
              className="px-6 py-3 bg-[#6366f1] text-white text-sm font-semibold rounded-lg hover:bg-[#4f46e5] transition-colors shadow-md"
            >
              Back to Content
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { font-family: ${FONT_FAMILY}; }
        body { background: ${BG_SECONDARY}; color: ${TEXT_PRIMARY}; margin: 0; }
        
        .format-btn {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        
        .format-btn.active {
          background: ${ACCENT_PRIMARY};
          color: white;
        }
        
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
      
      <main className="min-h-screen bg-[#f8fafc]">
        {/* Header */}
        <header className="bg-white border-b border-[#e2e8f0] px-6 py-5 shadow-sm">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => window.history.back()} 
                className="flex items-center gap-2 px-3 py-2 text-[#475569] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-all"
              >
                <Icon path={ICONS.arrowLeft} className="w-5 h-5" />
                <span className="text-sm font-medium">Back</span>
              </button>
              <div className="h-6 w-px bg-[#e2e8f0]"></div>
              <div>
                <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Study Notes</h1>
                <p className="text-sm text-[#64748b] mt-0.5">AI-generated comprehensive notes</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Icon path={ICONS.fileText} className="w-6 h-6 text-[#6366f1]" />
            </div>
          </div>
        </header>

        {/* Main Content - Two Column Layout */}
        <div className="flex">
          {/* Left - Preview Canvas */}
          <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-4xl mx-auto">
              <NotesCanvas 
                sections={sections}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>

          {/* Right Side - Actions Panel (Fixed to Right Edge) */}
          <div className="hidden lg:block w-[380px] xl:w-[420px] flex-shrink-0 bg-white border-l border-[#e2e8f0] shadow-lg">
            <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Icon path={ICONS.sparkles} className="w-5 h-5 text-[#6366f1]" />
                  <h3 className="text-lg font-bold text-[#0f172a]">Export Options</h3>
                </div>
                
                <p className="text-sm text-[#64748b] mb-6 leading-relaxed">
                  Choose your preferred format and download or copy your notes for studying.
                </p>

                <div className="h-px bg-[#e2e8f0] my-6"></div>

                {/* Format Selection */}
                <div className="mb-6">
                  <label className="text-sm font-semibold text-[#0f172a] mb-3 block">
                    Select Format
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setSelectedFormat('markdown')}
                      className={`format-btn px-3 py-3 border-2 font-semibold text-xs ${
                        selectedFormat === 'markdown'
                          ? 'active border-[#6366f1]'
                          : 'border-[#e2e8f0] bg-white text-[#475569] hover:border-[#6366f1]/50'
                      }`}
                    >
                      Markdown
                    </button>
                    <button
                      onClick={() => setSelectedFormat('plain')}
                      className={`format-btn px-3 py-3 border-2 font-semibold text-xs ${
                        selectedFormat === 'plain'
                          ? 'active border-[#6366f1]'
                          : 'border-[#e2e8f0] bg-white text-[#475569] hover:border-[#6366f1]/50'
                      }`}
                    >
                      Plain Text
                    </button>
                    <button
                      onClick={() => setSelectedFormat('pdf')}
                      className={`format-btn px-3 py-3 border-2 font-semibold text-xs ${
                        selectedFormat === 'pdf'
                          ? 'active border-[#6366f1]'
                          : 'border-[#e2e8f0] bg-white text-[#475569] hover:border-[#6366f1]/50'
                      }`}
                    >
                      PDF
                    </button>
                  </div>
                </div>

                <div className="h-px bg-[#e2e8f0] my-6"></div>

                {/* Instructions */}
                <div className="bg-[#f0f4ff] border border-[#d1dbf5] p-4 mb-6">
                  <ul className="space-y-3 text-sm text-[#64748b]">
                    <li className="flex items-start gap-2">
                      <Icon path={ICONS.checkCircle} className="w-4 h-4 text-[#6366f1] mt-0.5 flex-shrink-0" />
                      <span>Download notes for offline studying</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Icon path={ICONS.checkCircle} className="w-4 h-4 text-[#6366f1] mt-0.5 flex-shrink-0" />
                      <span>Copy to clipboard for quick sharing</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Icon path={ICONS.checkCircle} className="w-4 h-4 text-[#6366f1] mt-0.5 flex-shrink-0" />
                      <span>Format compatible with most apps</span>
                    </li>
                  </ul>
                </div>

                <div className="h-px bg-[#e2e8f0] my-6"></div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#6366f1] text-white font-bold hover:bg-[#4f46e5] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloading ? (
                      <>
                        <Icon path={ICONS.loader} className="w-5 h-5 animate-spin" />
                        Generating PDF...
                      </>
                    ) : (
                      <>
                        <Icon path={ICONS.download} className="w-5 h-5" />
                        Download Notes
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white border-2 border-[#e2e8f0] text-[#0f172a] font-semibold hover:border-[#6366f1] hover:bg-[#fafbfc] transition-all"
                  >
                    <Icon path={copied ? ICONS.checkCircle : ICONS.clipboard} className="w-5 h-5" />
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                </div>

                <div className="h-px bg-[#e2e8f0] my-6"></div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="py-4 border border-[#e2e8f0] bg-white">
                    <div className="text-2xl font-bold text-[#6366f1]">{sections.length}</div>
                    <div className="text-xs text-[#64748b] mt-1">Pages</div>
                  </div>
                  <div className="py-4 border border-[#e2e8f0] bg-white">
                    <div className="text-2xl font-bold text-[#6366f1]">
                      {sections.reduce((acc, s) => acc + s.content.split('\n').filter(l => l.trim()).length, 0)}
                    </div>
                    <div className="text-xs text-[#64748b] mt-1">Paragraphs</div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </main>
    </>
  );
}
