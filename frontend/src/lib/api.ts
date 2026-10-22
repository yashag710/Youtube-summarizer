import axios from "axios";

export const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL });

// Same pattern as the backend's extract_video_id (services/utils.py); /analyze rejects a mismatch
const VIDEO_ID = /(?:v=|youtu\.be\/|youtube\.com\/(?:shorts|embed|live)\/)([A-Za-z0-9_-]{11})/;

export function extractVideoId(link: string): string | null {
  return link.match(VIDEO_ID)?.[1] ?? null;
}

export const thumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** A readable message for any failed request; backend errors carry it in `detail`. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.response) {
      const data = err.response.data as { detail?: unknown; error?: unknown } | undefined;
      const detail = data?.detail ?? data?.error;
      return typeof detail === "string" ? detail : `The request failed (status ${err.response.status}).`;
    }
    if (err.code === "ECONNABORTED") return "The request took too long. Try again in a moment.";
    return "Can't reach the VNotes server. Check that the backend is running.";
  }
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export const isStatus = (err: unknown, status: number) =>
  axios.isAxiosError(err) && err.response?.status === status;

// --- Response types ---------------------------------------------------------

export interface Topic {
  topic: string;
  detailed_points: string[];
}

export interface Analysis {
  video_id: string;
  summary: string;
  topics: Topic[];
  transcript: string;
}

interface BaseQuestion {
  id: number;
  question: string;
  explanation: string;
  difficulty: string;
}

export type Question =
  | (BaseQuestion & { type: "multiple_choice"; options: string[]; correct_index: number })
  | (BaseQuestion & { type: "integer"; correct_answer: number })
  | (BaseQuestion & { type: "written"; sample_answer: string })
  | (BaseQuestion & { type: "code"; sample_solution: string });

export interface NoteSection {
  title: string;
  content: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
