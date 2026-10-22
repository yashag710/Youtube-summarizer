"use client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Trash2 } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { RequireVideo } from "@/components/require-video";
import { buttonStyles, ErrorNotice, Page, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";

const SUGGESTIONS = [
  "Summarize the main argument in three points",
  "Which terms from this video should I know?",
  "What's the most important example, and why?",
];

export default function ChatPage() {
  return (
    <RequireVideo feature="Ask">
      <Chat />
    </RequireVideo>
  );
}

function Chat() {
  const { analysis, chat, updateChat } = useSession();
  const videoId = analysis!.video_id;
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length, pending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    setDraft("");
    setError(null);
    setPending(true);
    updateChat(videoId, (c) => [...c, { role: "user", content: question }]);
    try {
      const { data } = await api.get<{ response: string }>("/query", { params: { query: question, video_id: videoId } });
      updateChat(videoId, (c) => [...c, { role: "assistant", content: data.response }]);
    } catch (err) {
      // Take the question back out and return it to the box, so nothing is lost
      updateChat(videoId, (c) => c.slice(0, -1));
      setDraft(question);
      setError(errorMessage(err));
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <Page
      title="Ask"
      description="Answers draw on the video's transcript when it covers your question."
      actions={
        chat.length > 0 && (
          <button type="button" onClick={() => updateChat(videoId, () => [])} disabled={pending} className={buttonStyles.ghost}>
            <Trash2 className="size-4" aria-hidden="true" /> Clear conversation
          </button>
        )
      }
    >
      {/* Fill the viewport below the page header so the composer sits at the bottom */}
      <div className="flex min-h-[calc(100dvh-16rem)] flex-col md:min-h-[calc(100dvh-12rem)]">
        {chat.length === 0 && !pending ? (
          <div className="py-6">
            <p className="text-sm font-semibold text-ink-soft">Try asking</p>
            <ul className="mt-3 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)} className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left text-[0.95rem] text-ink hover:border-pine">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="flex flex-col gap-6 pb-6" aria-live="polite">
            {chat.map((m, i) =>
              m.role === "user" ? (
                <li key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-pine-tint px-4 py-2.5 text-[0.95rem] text-ink">
                  <span className="sr-only">You: </span>
                  {m.content}
                </li>
              ) : (
                <li key={i} className="max-w-[68ch] font-serif text-[1.02rem] text-ink">
                  <span className="sr-only">VNotes: </span>
                  <Markdown text={m.content} />
                </li>
              ),
            )}
            {pending && (
              <li className="flex items-center gap-2 text-sm text-ink-soft" role="status">
                <Spinner className="size-4 text-pine" /> Thinking…
              </li>
            )}
          </ol>
        )}
        <div ref={endRef} />

        <div className="sticky bottom-[calc(3.9rem+env(safe-area-inset-bottom))] mt-auto bg-paper pb-4 pt-2 md:bottom-0">
          {error && (
            <div className="mb-3">
              <ErrorNotice message={`${error} Your question is back in the box.`} />
            </div>
          )}
          <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 focus-within:border-pine">
            <label htmlFor="question" className="sr-only">Your question</label>
            <textarea
              id="question"
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about this video…"
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-ink outline-none [field-sizing:content] placeholder:text-muted"
            />
            <button type="submit" disabled={pending || !draft.trim()} className={`${buttonStyles.primary} size-11 shrink-0 p-0`} aria-label="Send question">
              <ArrowUp className="size-5" aria-hidden="true" />
            </button>
          </form>
          <p className="mt-1.5 hidden px-1 text-xs text-muted sm:block">Enter to send, Shift+Enter for a new line</p>
        </div>
      </div>
    </Page>
  );
}
