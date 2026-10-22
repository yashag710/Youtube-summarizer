"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Download, RotateCcw, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Markdown } from "@/components/markdown";
import { RequireVideo } from "@/components/require-video";
import { buttonStyles, ErrorNotice, LoadingBlock, Page, Spinner } from "@/components/ui";
import { api, errorMessage, type NoteSection } from "@/lib/api";
import { useSession } from "@/lib/session";

type Format = "markdown" | "text" | "pdf";
const FORMATS: { value: Format; label: string }[] = [
  { value: "markdown", label: "Markdown" },
  { value: "text", label: "Text" },
  { value: "pdf", label: "PDF" },
];

const toMarkdown = (sections: NoteSection[]) =>
  `# Study notes\n\n${sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n")}\n`;

const toText = (sections: NoteSection[]) =>
  `STUDY NOTES\n\n${sections.map((s) => `${s.title.toUpperCase()}\n${"-".repeat(Math.min(s.title.length, 60))}\n${s.content.replace(/\*\*|`/g, "")}`).join("\n\n")}\n`;

/** Wait until page `i` is rendered. Timers, not requestAnimationFrame: rAF never fires in a background tab. */
async function waitForPage(i: number) {
  for (let tries = 0; tries < 40; tries++) {
    const el = document.getElementById(`page-${i}`);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Page ${i + 1} couldn't be rendered for the PDF.`);
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function NotesPage() {
  return (
    <RequireVideo feature="Notes">
      <Notes />
    </RequireVideo>
  );
}

function Notes() {
  const { analysis, notes, setNotes } = useSession();
  const videoId = analysis!.video_id;
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>("pdf");
  const [exporting, setExporting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  // refresh = ask for new notes; otherwise the server returns its cached ones if it has them
  const generate = useCallback(async (refresh = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<{ sections: NoteSection[] }>("/notes", null, { params: { video_id: videoId, refresh } });
      if (!data.sections?.length) throw new Error("The notes came back empty. Try generating them again.");
      setNotes(videoId, data.sections);
      setPage(0);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [videoId, setNotes]);

  // Generate once per video; the result is cached in the session
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on first open is what this effect is for
    if (!notes) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = notes?.length ?? 0;
  const go = useCallback((to: number) => setPage(Math.max(0, Math.min(total - 1, to))), [total]);

  // Arrow keys turn pages, unless the user is typing somewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(page - 1);
      if (e.key === "ArrowRight") go(page + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page]);

  if (loading) return <LoadingBlock label="Writing your study notes…" />;
  if (!notes) {
    return (
      <Page title="Notes">
        <ErrorNotice
          message={error ?? "The notes couldn't be created."}
          action={<button type="button" onClick={() => generate(true)} className={`${buttonStyles.secondary} py-2`}><RotateCcw className="size-4" aria-hidden="true" /> Try again</button>}
        />
      </Page>
    );
  }

  const exportPdf = async () => {
    const start = page;
    setExporting("Preparing your PDF…");
    try {
      // Loaded on demand: they're large and only needed here
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const pdf = new jsPDF("p", "mm", "a4");
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      await document.fonts.ready;
      for (let i = 0; i < notes.length; i++) {
        setExporting(`Preparing page ${i + 1} of ${notes.length}…`);
        setPage(i);
        const el = await waitForPage(i);
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          logging: false,
          onclone: (doc) => {
            const page = doc.getElementById(`page-${i}`);
            if (page) Object.assign(page.style, { border: "none", borderRadius: "0", boxShadow: "none" });
          },
        });
        const image = canvas.toDataURL("image/jpeg", 0.92);
        const imageHeight = (canvas.height * width) / canvas.width;
        // A long section continues onto further PDF pages instead of being cut off
        for (let y = 0; y < imageHeight; y += height) {
          if (i > 0 || y > 0) pdf.addPage();
          pdf.addImage(image, "JPEG", 0, -y, width, imageHeight);
        }
      }
      pdf.save(`vnotes-${videoId}.pdf`);
    } catch (err) {
      setError(`The PDF couldn't be created: ${errorMessage(err)}`);
    } finally {
      setPage(start);
      setExporting(null);
    }
  };

  const download = () => {
    setError(null);
    if (format === "pdf") return exportPdf();
    if (format === "markdown") downloadFile(`vnotes-${videoId}.md`, toMarkdown(notes), "text/markdown");
    else downloadFile(`vnotes-${videoId}.txt`, toText(notes), "text/plain");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(format === "text" ? toText(notes) : toMarkdown(notes));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying isn't allowed in this browser. Use Download instead.");
    }
  };

  const section = notes[Math.min(page, total - 1)];

  return (
    <Page
      wide
      title="Notes"
      description={`${total} ${total === 1 ? "page" : "pages"} of study notes from this video.`}
      actions={
        <button type="button" onClick={() => generate(true)} disabled={!!exporting} className={buttonStyles.ghost}>
          <Sparkles className="size-4" aria-hidden="true" /> Rewrite notes
        </button>
      }
    >
      {error && <div className="mb-6"><ErrorNotice message={error} /></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8">
        <aside className="lg:order-last">
          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-6">
            <div>
              <p id="format-label" className="mb-2 text-sm font-semibold">Export as</p>
              <div role="radiogroup" aria-labelledby="format-label" className="flex gap-1 rounded-lg bg-paper p-1">
                {FORMATS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={format === f.value}
                    onClick={() => setFormat(f.value)}
                    className={`flex-auto whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${format === f.value ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_#b9c4bf]" : "text-ink-soft hover:text-ink"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <button type="button" onClick={download} disabled={!!exporting} className={buttonStyles.primary}>
                {exporting ? <Spinner className="size-4" /> : <Download className="size-4" aria-hidden="true" />}
                {exporting ? "Exporting…" : "Download"}
              </button>
              <button type="button" onClick={copy} disabled={format === "pdf" || !!exporting} className={buttonStyles.secondary} title={format === "pdf" ? "Choose Markdown or Plain text to copy" : undefined}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {exporting && <p className="text-xs text-ink-soft" role="status">{exporting}</p>}

            <nav aria-label="Note sections" className="hidden lg:block">
              <p className="mb-2 text-sm font-semibold">Sections</p>
              <ol className="space-y-0.5">
                {notes.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-current={i === page ? "page" : undefined}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm leading-snug ${i === page ? "bg-pine-tint font-semibold text-pine-dark" : "text-ink-soft hover:bg-paper"}`}
                    >
                      {s.title || `Page ${i + 1}`}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <article id={`page-${page}`} className="min-h-[60vh] rounded-2xl border border-line bg-surface px-5 py-7 shadow-[0_1px_2px_#d9e0dc] sm:px-10 sm:py-10 lg:px-14 lg:py-12">
            <div className="mb-8 flex items-center justify-between border-b border-line pb-3 text-xs text-muted">
              <span className="flex items-center gap-2">
                <LogoMark className="size-4" /> VNotes study notes
              </span>
              <span>Page {page + 1} of {total}</span>
            </div>
            {section.title && <h2 className="text-2xl font-bold tracking-[-0.02em] text-ink">{section.title}</h2>}
            <Markdown text={section.content} className="mt-5 font-serif text-[1.02rem] text-ink" />
          </article>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button type="button" onClick={() => go(page - 1)} disabled={page === 0 || !!exporting} className={buttonStyles.secondary}>
              <ChevronLeft className="size-4" aria-hidden="true" /> Previous
            </button>
            <span className="text-sm tabular-nums text-ink-soft">{page + 1} / {total}</span>
            <button type="button" onClick={() => go(page + 1)} disabled={page >= total - 1 || !!exporting} className={buttonStyles.secondary}>
              Next <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </Page>
  );
}
