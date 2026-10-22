"use client";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, FileText, ListChecks, Lock, MessagesSquare, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, type LucideIcon } from "lucide-react";
import { LogoMark } from "./logo";
import { buttonStyles } from "./ui";
import { thumbnailUrl, watchUrl } from "@/lib/api";
import { useSession } from "@/lib/session";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  needsVideo: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Summary", icon: FileText, needsVideo: false },
  { href: "/chat", label: "Ask", icon: MessagesSquare, needsVideo: true },
  { href: "/qna", label: "Quiz", icon: ListChecks, needsVideo: true },
  { href: "/notes", label: "Notes", icon: NotebookPen, needsVideo: true },
];

const LOCKED_HINT = "Summarize a video to unlock this";

function useNav() {
  const pathname = usePathname();
  const { status } = useSession();
  return NAV.map((item) => {
    const locked = item.needsVideo && status !== "ready";
    const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return { ...item, locked, active: current && !locked };
  });
}

/** Sidebar on desktop (labels), icon rail on tablets. */
function SideNav() {
  return (
    <ul className="-mx-3 mt-8 flex flex-col gap-1 wide:-mx-4">
      {useNav().map(({ href, label, icon: Icon, active, locked }) => {
        const inner = (
          <>
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className={`text-[0.7rem] wide:text-[0.95rem]`}>{label}</span>
            {locked && <Lock className="ml-auto hidden size-3.5 wide:block" aria-hidden="true" />}
          </>
        );
        // Full-bleed rows: the -mx on the <ul> cancels the aside padding so the highlight spans the whole sidebar.
        const base = "flex flex-col items-center gap-1 px-2 py-2.5 focus-visible:outline-offset-[-2px] wide:flex-row wide:gap-3 wide:px-7";
        return (
          <li key={href}>
            {locked ? (
              <span aria-disabled="true" title={LOCKED_HINT} className={`${base} cursor-not-allowed text-muted/70`}>
                {inner}
                <span className="sr-only"> (locked: {LOCKED_HINT.toLowerCase()})</span>
              </span>
            ) : (
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`${base} ${active ? "bg-pine-tint font-semibold text-pine-dark shadow-[inset_3px_0_0_var(--color-pine)]" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
              >
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Bottom tab bar on phones. */
function BottomNav() {
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-4">
        {useNav().map(({ href, label, icon: Icon, active, locked }) => {
          const base = "flex flex-col items-center gap-1 py-2.5 text-[0.72rem]";
          const inner = (
            <>
              <Icon className="size-5" aria-hidden="true" />
              <span className={active ? "marker font-semibold" : ""}>{label}</span>
            </>
          );
          return (
            <li key={href}>
              {locked ? (
                <span aria-disabled="true" title={LOCKED_HINT} className={`${base} text-muted/60`}>
                  {inner}
                  <span className="sr-only"> (locked)</span>
                </span>
              ) : (
                <Link href={href} aria-current={active ? "page" : undefined} className={`${base} ${active ? "text-pine-dark" : "text-ink-soft"}`}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CurrentVideo({ onNewVideo }: { onNewVideo: () => void }) {
  const { videoId, status } = useSession();
  if (!videoId || status === "empty") return null;
  return (
    <div className="mt-auto flex flex-col gap-3">
      <div className="hidden wide:block">
        <a href={watchUrl(videoId)} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-line">
          <Image src={thumbnailUrl(videoId)} alt="" width={320} height={180} className="aspect-video w-full object-cover" />
          <span className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-soft group-hover:text-pine-dark">
            Watch on YouTube <ExternalLink className="size-3" aria-hidden="true" />
          </span>
        </a>
      </div>
      <button type="button" onClick={onNewVideo} className={`${buttonStyles.secondary} px-2 wide:px-4`} title="Start over with a new video">
        <Plus className="size-4" aria-hidden="true" />
        <span className="hidden wide:inline">New video</span>
        <span className="sr-only wide:hidden">New video</span>
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, reset } = useSession();
  // Read after mount so server and client render the same markup first.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is read after mount to avoid a hydration mismatch
      if (localStorage.getItem("vnotes:sidebar") === "closed") setOpen(false);
    } catch {}
  }, []);
  const toggleSidebar = () => {
    setOpen(!open);
    try {
      localStorage.setItem("vnotes:sidebar", open ? "closed" : "open");
    } catch {}
  };
  const newVideo = () => {
    reset();
    router.push("/");
  };

  return (
    <div data-sidebar={open ? "open" : "closed"} className="min-h-dvh md:grid md:grid-cols-[84px_minmax(0,1fr)] wide:grid-cols-[248px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 md:flex wide:px-4">
        <div className="flex flex-col items-center gap-3 wide:flex-row wide:justify-between">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg wide:px-2">
            <LogoMark />
            <span className="hidden text-[1.2rem] font-bold tracking-[-0.02em] wide:inline">VNotes</span>
            <span className="sr-only wide:hidden">VNotes</span>
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={open}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
            className="hidden rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink lg:block"
          >
            {open ? <PanelLeftClose className="size-5" aria-hidden="true" /> : <PanelLeftOpen className="size-5" aria-hidden="true" />}
          </button>
        </div>
        <nav aria-label="Sections">
          <SideNav />
        </nav>
        {status !== "ready" && (
          <p className="mt-4 hidden px-3 text-xs leading-relaxed text-muted wide:block">
            Ask, Quiz and Notes unlock once your video is summarized.
          </p>
        )}
        <CurrentVideo onNewVideo={newVideo} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="text-lg font-bold tracking-[-0.02em]">VNotes</span>
        </Link>
        {status === "ready" && (
          <button type="button" onClick={newVideo} className={`${buttonStyles.ghost} px-3 py-1.5`}>
            <Plus className="size-4" aria-hidden="true" /> New video
          </button>
        )}
      </header>

      <main id="main" className="min-w-0 pb-24 md:pb-0">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
