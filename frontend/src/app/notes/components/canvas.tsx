"use client";
import React from "react";

// Icon helper component
const Icon = ({
  path,
  className = "w-5 h-5",
}: {
  path: React.ReactNode;
  className?: string;
}) => (
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

const ICONS = {
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
};

interface NoteSection {
  title: string;
  content: string;
}

interface NotesCanvasProps {
  sections: NoteSection[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function NotesCanvas({
  sections,
  currentPage,
  onPageChange,
}: NotesCanvasProps) {
  const totalPages = sections.length;
  const currentSection = sections[currentPage] || {
    title: "No content",
    content: "",
  };

  const IMPORTANT_HEADINGS = [
    "introduction",
    "important details",
    "key takeaways",
    "key topics",
    "conclusion",
  ];

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      onPageChange(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      onPageChange(currentPage - 1);
    }
  };

  // Clean all markdown formatting & remove stray *
  const cleanMarkdown = (text: string): string => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/\*/g, "")
      .trim();
  };

  const renderContent = () => {
    const lines = currentSection.content.split("\n");
    const elements: React.JSX.Element[] = [];

    let listItems: string[] = [];
    let listType: "bullet" | "numbered" | null = null;

    const flushList = () => {
      if (listItems.length === 0) return;

      if (listType === "bullet") {
        elements.push(
          <ul
            key={`list-${elements.length}`}
            className="pl-6 my-4 space-y-2"
          >
            {listItems.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start text-[15px] text-[#374151] leading-7"
              >
                <span className="mr-2 mt-1">•</span>
                <span className="flex-1">
                  {cleanMarkdown(item)}
                </span>
              </li>
            ))}
          </ul>
        );
      }

      if (listType === "numbered") {
        elements.push(
          <div
            key={`list-${elements.length}`}
            className="pl-6 my-4 space-y-2"
          >
            {listItems.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start text-[15px] text-[#374151] leading-7"
              >
                <span className="mr-2 mt-1">▸</span>
                <span className="flex-1">
                  {cleanMarkdown(item)}
                </span>
              </div>
            ))}
          </div>
        );
      }

      listItems = [];
      listType = null;
    };


    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        return;
      }

      const cleaned = cleanMarkdown(trimmed);

      // Bullet list detection
      if (/^[-•]\s+/.test(trimmed)) {
        const content = trimmed.replace(/^[-•]\s+/, "");
        if (listType !== "bullet") {
          flushList();
          listType = "bullet";
        }
        listItems.push(content);
      }

      // Numbered list detection
      else if (/^\d+\.\s+/.test(trimmed)) {
        const content = trimmed.replace(/^\d+\.\s+/, "");
        if (listType !== "numbered") {
          flushList();
          listType = "numbered";
        }
        listItems.push(content);
      }

      // Important section headings
      else if (
        IMPORTANT_HEADINGS.includes(
          cleaned.toLowerCase().replace(":", "")
        )
      ) {
        flushList();
        elements.push(
          <h2
            key={`heading-${idx}`}
            className="text-2xl font-bold text-[#111827] mt-8 mb-4"
          >
            {cleaned}
          </h2>
        );
      }

      // Normal paragraph
      else {
        flushList();
        elements.push(
          <p
            key={`para-${idx}`}
            className="text-[15px] text-[#374151] leading-8 mb-4 text-justify"
          >
            {cleaned}
          </p>
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className="space-y-6">
      <div
        id={`page-${currentPage}`}
        className="bg-white rounded-lg shadow-2xl border border-[#d1d5db] overflow-hidden"
        style={{
          width: "100%",
          aspectRatio: "210 / 297",
          minHeight: "800px",
          maxWidth: "850px",
          margin: "0 auto",
        }}
      >
        <div className="h-full flex flex-col">
          {/* Page Content */}
          <div className="flex-1 p-12 overflow-y-auto">
            <div className="max-w-[700px] mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-6 border-b">
                <p className="text-xs uppercase tracking-wide" style={{ color: '#6b7280' }}>
                  Study Notes
                </p>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  Page {currentPage + 1} of {totalPages}
                </p>
              </div>

              {/* Title */}
              {currentSection.title && (
                <h1 className="text-3xl font-bold text-[#111827] mb-8">
                  {currentSection.title}
                </h1>
              )}

              {/* Content */}
              {renderContent()}
            </div>
          </div>

          {/* Footer */}
          <div className="px-12 py-4 border-t" style={{ backgroundColor: '#f9fafb' }}>
            <div className="flex items-center justify-between">
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded disabled:opacity-30"
                style={{ color: '#6366f1' }}
              >
                <Icon path={ICONS.chevronLeft} className="w-3 h-3" />
                Previous
              </button>

              <span className="text-xs" style={{ color: '#6b7280' }}>
                {currentPage + 1} / {totalPages}
              </span>

              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages - 1}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded disabled:opacity-30"
                style={{ color: '#6366f1' }}
              >
                Next
                <Icon path={ICONS.chevronRight} className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
