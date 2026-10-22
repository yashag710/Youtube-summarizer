import { useId } from "react";

// VNotes mark: a solid play triangle (the video) with rays fanning out of it (the notes).
// Same artwork as app/icon.svg (the favicon).
export function LogoMark({ className = "size-8" }: { className?: string }) {
  // Unique gradient id: the mark renders twice (sidebar + mobile header) and a gradient
  // defined inside a display:none copy would leave the visible one unpainted.
  const id = useId();
  const paint = `url(#${id})`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="2" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6FD3A6" />
          <stop offset="1" stopColor="#1F5F4F" />
        </linearGradient>
      </defs>
      <path d="M16.5 6.5 28 16 16.5 25.5z" fill={paint} stroke={paint} strokeWidth="3" strokeLinejoin="round" />
      <path
        d="M7.5 16H2M8.6 12.8 4.1 9.5M8.6 19.2l-4.5 3.3M11.3 10.8 9.6 5.5M11.3 21.2l-1.7 5.3"
        stroke={paint}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact && <span className="text-[1.2rem] font-bold tracking-[-0.02em] text-ink">VNotes</span>}
    </span>
  );
}
