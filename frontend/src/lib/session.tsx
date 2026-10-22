"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorMessage, extractVideoId, type Analysis, type ChatMessage, type NoteSection, type Question } from "./api";

/**
 * One video session per browser tab, held above every page so switching tabs never refetches
 * (each /analyze, /notes and /generate_qna call costs a rate-limit slot and an LLM call).
 * Persisted in sessionStorage: survives reloads, and two tabs can work on different videos.
 */

export type Status = "restoring" | "empty" | "analyzing" | "ready" | "error";

interface Stored {
  link: string;
  analysis: Analysis | null;
  qnaToken: string | null;
  quiz: Question[] | null;
  notes: NoteSection[] | null;
  chat: ChatMessage[];
}

interface SessionValue extends Stored {
  status: Status;
  error: string | null;
  /** Known as soon as analysis starts, so the thumbnail can show while it runs. */
  videoId: string | null;
  analyze: (link: string) => Promise<void>;
  /** Re-run analyze (a fast cache hit) to get a fresh 1-hour quiz token. */
  refreshQnaToken: () => Promise<string>;
  reset: () => void;
  // Setters take the videoId the data belongs to, so a late response for a previous video is dropped
  setQuiz: (videoId: string, quiz: Question[] | null) => void;
  setNotes: (videoId: string, notes: NoteSection[] | null) => void;
  updateChat: (videoId: string, update: (chat: ChatMessage[]) => ChatMessage[]) => void;
}

const EMPTY: Stored = { link: "", analysis: null, qnaToken: null, quiz: null, notes: null, chat: [] };
const STORAGE_KEY = "vnotes:session";
const ANALYZE_TIMEOUT_MS = 15 * 60 * 1000; // long videos take minutes to transcribe on CPU

async function fetchAnalysis(link: string) {
  const videoId = extractVideoId(link);
  const { data: tokenRes } = await api.post<{ token: string }>("/generate_token", null, { params: { video_id: videoId } });
  const { data } = await api.post<Analysis & { qna_token: string }>(
    "/analyze",
    { video_link: link },
    { headers: { Authorization: `Bearer ${tokenRes.token}` }, timeout: ANALYZE_TIMEOUT_MS },
  );
  const { qna_token, ...analysis } = data;
  return { analysis, qnaToken: qna_token };
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Stored>(EMPTY);
  const [status, setStatus] = useState<Status>("restoring");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0); // bumps on every analyze/reset, so stale responses are ignored

  // Restore after mount: sessionStorage doesn't exist during prerender
  useEffect(() => {
    let restored: Stored | null = null;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) restored = { ...EMPTY, ...(JSON.parse(saved) as Partial<Stored>) };
    } catch {
      // unreadable storage: start fresh
    }
    if (restored?.analysis) {
      setData(restored);
      setStatus("ready");
    } else {
      setStatus("empty");
    }
  }, []);

  useEffect(() => {
    if (status === "restoring" || status === "analyzing") return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full or blocked: the session just won't survive a reload
    }
  }, [data, status]);

  const analyze = useCallback(async (link: string) => {
    const id = ++requestId.current;
    setData({ ...EMPTY, link });
    setError(null);
    setStatus("analyzing");
    try {
      const { analysis, qnaToken } = await fetchAnalysis(link);
      if (id !== requestId.current) return;
      setData((d) => ({ ...d, analysis, qnaToken }));
      setStatus("ready");
    } catch (err) {
      if (id !== requestId.current) return;
      setError(errorMessage(err));
      setStatus("error");
    }
  }, []);

  const refreshQnaToken = useCallback(async () => {
    const { analysis, qnaToken } = await fetchAnalysis(data.link);
    setData((d) => (d.link === data.link ? { ...d, analysis, qnaToken } : d));
    return qnaToken;
  }, [data.link]);

  const reset = useCallback(() => {
    requestId.current++;
    setData(EMPTY);
    setError(null);
    setStatus("empty");
  }, []);

  const forVideo = useCallback(
    (videoId: string, patch: (d: Stored) => Partial<Stored>) =>
      setData((d) => (d.analysis?.video_id === videoId ? { ...d, ...patch(d) } : d)),
    [],
  );

  const value = useMemo<SessionValue>(
    () => ({
      ...data,
      status,
      error,
      videoId: data.analysis?.video_id ?? extractVideoId(data.link),
      analyze,
      refreshQnaToken,
      reset,
      setQuiz: (videoId, quiz) => forVideo(videoId, () => ({ quiz })),
      setNotes: (videoId, notes) => forVideo(videoId, () => ({ notes })),
      updateChat: (videoId, update) => forVideo(videoId, (d) => ({ chat: update(d.chat) })),
    }),
    [data, status, error, analyze, refreshQnaToken, reset, forVideo],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
