"use client";
import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Link2, ListChecks, MessagesSquare, NotebookPen, RotateCcw } from "lucide-react";
import { buttonStyles, ErrorNotice, LoadingBlock, Spinner } from "@/components/ui";
import { extractVideoId, thumbnailUrl, watchUrl } from "@/lib/api";
import { useSession } from "@/lib/session";

const TOOLS = [
  { href: "/chat", icon: MessagesSquare, label: "Ask", text: "Ask questions and get answers drawn from the transcript." },
  { href: "/qna", icon: ListChecks, label: "Quiz", text: "Test yourself with about 20 questions at mixed difficulty." },
  { href: "/notes", icon: NotebookPen, label: "Notes", text: "Read structured study notes and export them as PDF or Markdown." },
];

export default function SummaryPage() {
  const { status } = useSession();
  if (status === "restoring") return <LoadingBlock label="Loading your session…" />;
  if (status === "analyzing") return <Analyzing />;
  if (status === "ready") return <SummaryView />;
  return <Start />;
}

function Start() {
  const { analyze, status, error, link: lastLink } = useSession();
  const [link, setLink] = useState(lastLink);
  const [invalid, setInvalid] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = link.trim();
    if (!extractVideoId(trimmed)) return setInvalid(true);
    analyze(trimmed);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 md:pt-20 lg:px-10">
      <h1 className="max-w-[18ch] text-[2.1rem] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-5xl">
        Turn a YouTube video into notes you can study
      </h1>
      <p className="mt-4 max-w-[52ch] text-[1.05rem] leading-relaxed text-ink-soft">
        Paste a link. VNotes transcribes the video, summarizes each part, then builds a quiz and study notes from it.
      </p>

      <form onSubmit={submit} noValidate className="mt-8 rounded-2xl border border-line-strong bg-surface p-2 shadow-[0_1px_0_#d9e0dc] focus-within:border-pine">
        <label htmlFor="video-link" className="sr-only">YouTube link</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
            <Link2 className="size-5 shrink-0 text-muted" aria-hidden="true" />
            <input
              id="video-link"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.youtube.com/watch?v=…"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setInvalid(false);
              }}
              aria-invalid={invalid}
              aria-describedby="video-link-hint"
              className="min-w-0 flex-1 bg-transparent py-3 text-base text-ink outline-none placeholder:text-muted"
            />
          </div>
          <button type="submit" disabled={!link.trim()} className={`${buttonStyles.primary} py-3 sm:px-6`}>
            Summarize
          </button>
        </div>
      </form>
      <p id="video-link-hint" className={`mt-2.5 px-1 text-sm ${invalid ? "text-danger" : "text-muted"}`}>
        {invalid
          ? "That doesn't look like a YouTube video link. Check it and try again."
          : "Works with youtube.com, youtu.be and Shorts links, for videos up to 30 minutes."}
      </p>

      {status === "error" && error && (
        <div className="mt-6">
          <ErrorNotice
            message={error}
            action={
              lastLink && (
                <button type="button" onClick={() => analyze(lastLink)} className={`${buttonStyles.secondary} py-2`}>
                  <RotateCcw className="size-4" aria-hidden="true" /> Try again
                </button>
              )
            }
          />
        </div>
      )}

      <section aria-labelledby="unlocks" className="mt-14">
        <h2 id="unlocks" className="text-sm font-semibold text-ink-soft">Once it&apos;s summarized, you can also</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {TOOLS.map(({ icon: Icon, label, text }) => (
            <li key={label} className="flex items-start gap-4 py-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-pine" aria-hidden="true" />
              <p className="text-[0.95rem] text-ink-soft">
                <span className="font-semibold text-ink">{label}.</span> {text}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Analyzing() {
  const { videoId } = useSession();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6 md:py-24">
      {videoId && (
        <Image
          src={thumbnailUrl(videoId)}
          alt=""
          width={640}
          height={360}
          priority
          className="aspect-video w-full rounded-xl border border-line object-cover"
        />
      )}
      <div className="mt-6 flex items-start gap-3" role="status" aria-live="polite">
        <Spinner className="mt-0.5 size-5 text-pine" />
        <div>
          <p className="font-semibold text-ink">Transcribing and summarizing your video</p>
          <p className="mt-1 text-sm text-ink-soft">
            This takes roughly a minute for every few minutes of video. You can keep this tab open and come back.
          </p>
          <p className="mt-3 font-mono text-sm tabular-nums text-muted" aria-hidden="true">{elapsed} elapsed</p>
        </div>
      </div>
    </div>
  );
}

function SummaryView() {
  const { analysis } = useSession();
  if (!analysis) return null;
  const { video_id, summary, topics, transcript } = analysis;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-6 sm:px-6 md:py-10 lg:px-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <article className="min-w-0">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <a href={watchUrl(video_id)} target="_blank" rel="noreferrer" className="block shrink-0 sm:w-56">
            <Image
              src={thumbnailUrl(video_id)}
              alt="Video thumbnail"
              width={448}
              height={252}
              priority
              className="aspect-video w-full rounded-xl border border-line object-cover"
            />
          </a>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-[1.75rem]">Summary</h1>
            <a href={watchUrl(video_id)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-pine-dark">
              Watch on YouTube <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
            <div className="mt-4 flex flex-wrap gap-2">
              {TOOLS.map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href} className={`${buttonStyles.secondary} py-2`}>
                  <Icon className="size-4" aria-hidden="true" /> {label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        <section aria-labelledby="overview" className="mt-10">
          <h2 id="overview" className="text-lg font-bold">Overview</h2>
          <p className="mt-3 max-w-[68ch] font-serif text-[1.06rem] leading-[1.8] text-ink">{summary}</p>
        </section>

        {topics.length > 0 && (
          <section aria-labelledby="topics" className="mt-12">
            <h2 id="topics" className="text-lg font-bold">In order through the video</h2>
            <ol className="mt-4 space-y-8">
              {topics.map((topic, i) => (
                <li key={i} id={`topic-${i}`} className="scroll-mt-20 border-l-2 border-line pl-5">
                  <p className="text-xs font-semibold text-muted">Part {i + 1} of {topics.length}</p>
                  <h3 className="mt-1 text-[1.05rem] font-semibold leading-snug text-ink">{topic.topic}</h3>
                  <div className="mt-3 max-w-[68ch] space-y-3 font-serif text-[1.02rem] leading-[1.8] text-ink-soft">
                    {topic.detailed_points.map((point, j) => <p key={j}>{point}</p>)}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {transcript && (
          <details className="group mt-12 rounded-xl border border-line bg-surface">
            <summary className="cursor-pointer list-none px-5 py-4 font-semibold marker:hidden">
              <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">›</span>{" "}
              Full transcript
            </summary>
            <p className="max-h-96 overflow-y-auto border-t border-line px-5 py-4 font-serif leading-[1.8] text-ink-soft">{transcript}</p>
          </details>
        )}
      </article>

      {topics.length > 1 && (
        <nav aria-label="On this page" className="hidden xl:block">
          <div className="sticky top-10">
            <p className="text-sm font-semibold text-ink-soft">On this page</p>
            <ol className="mt-3 space-y-2 border-l border-line">
              {topics.map((topic, i) => (
                <li key={i}>
                  <a href={`#topic-${i}`} className="-ml-px block border-l border-transparent pl-3 text-sm leading-snug text-ink-soft hover:border-pine hover:text-pine-dark">
                    <span className="line-clamp-2">{topic.topic}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      )}
    </div>
  );
}
