"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { RequireVideo } from "@/components/require-video";
import { buttonStyles, ErrorNotice, LoadingBlock, Page } from "@/components/ui";
import { api, errorMessage, isStatus, type Question } from "@/lib/api";
import { useSession } from "@/lib/session";

const LETTERS = "ABCD";
const SCORED = new Set(["multiple_choice", "integer"]);

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: "bg-success-tint text-success",
  medium: "bg-[#fff4bf] text-[#6b5500]",
  hard: "bg-danger-tint text-danger",
};

const TYPE_LABEL: Record<Question["type"], string> = {
  multiple_choice: "Multiple choice",
  integer: "Number answer",
  written: "Written answer",
  code: "Code",
};

function isCorrect(q: Question, answer: string | undefined) {
  if (answer === undefined || answer.trim() === "") return false;
  if (q.type === "multiple_choice") return answer === String(q.correct_index);
  if (q.type === "integer") return Number(answer.trim()) === Number(q.correct_answer);
  return false;
}

export default function QuizPage() {
  return (
    <RequireVideo feature="Quiz">
      <Quiz />
    </RequireVideo>
  );
}

interface Attempt {
  answers: Record<number, string>;
  submitted: boolean;
}

/** Answers survive tab switches and reloads, per video. */
function useAttempt(videoId: string) {
  const key = `vnotes:quiz-attempt:${videoId}`;
  const [attempt, setAttempt] = useState<Attempt>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? "") as Attempt;
    } catch {
      return { answers: {}, submitted: false };
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(attempt));
    } catch {
      // storage unavailable: answers just won't persist
    }
  }, [key, attempt]);
  return [attempt, setAttempt] as const;
}

function Quiz() {
  const { analysis, quiz, setQuiz, qnaToken, refreshQnaToken } = useSession();
  const videoId = analysis!.video_id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [{ answers, submitted }, setAttempt] = useAttempt(videoId);
  const inFlight = useRef(false);

  // refresh = ask for a new quiz; otherwise the server returns its cached one if it has it
  const generate = useCallback(async (refresh = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    const request = (token: string) =>
      api.post<{ qna?: { questions: Question[] }; error?: string }>("/generate_qna", null, {
        params: { video_id: videoId, refresh },
        headers: { Authorization: `Bearer ${token}` },
      });
    try {
      let res;
      try {
        res = await request(qnaToken ?? "");
      } catch (err) {
        if (!isStatus(err, 401)) throw err;
        res = await request(await refreshQnaToken()); // token expired after an hour: get a fresh one
      }
      if (res.data.error) throw new Error(res.data.error);
      const questions = res.data.qna?.questions ?? [];
      if (!questions.length) throw new Error("No questions came back for this video. Try generating the quiz again.");
      setQuiz(videoId, questions);
      setAttempt({ answers: {}, submitted: false });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [videoId, qnaToken, refreshQnaToken, setQuiz, setAttempt]);

  // Generate once per video; the result is cached in the session
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on first open is what this effect is for
    if (!quiz) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingBlock label="Writing your quiz. This takes a few seconds…" />;
  if (!quiz) {
    return (
      <Page title="Quiz">
        <ErrorNotice
          message={error ?? "The quiz couldn't be created."}
          action={<button type="button" onClick={() => generate(true)} className={`${buttonStyles.secondary} py-2`}><RotateCcw className="size-4" aria-hidden="true" /> Try again</button>}
        />
      </Page>
    );
  }

  const scored = quiz.filter((q) => SCORED.has(q.type));
  const score = scored.filter((q) => isCorrect(q, answers[quiz.indexOf(q)])).length;
  const answered = quiz.filter((_, i) => answers[i]?.trim()).length;
  const setAnswer = (i: number, value: string) =>
    !submitted && setAttempt((a) => ({ ...a, answers: { ...a.answers, [i]: value } }));
  const submit = () => {
    setAttempt((a) => ({ ...a, submitted: true }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const retake = () => {
    setAttempt({ answers: {}, submitted: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Page
      title="Quiz"
      description={`${quiz.length} questions. Multiple-choice and number answers are scored; compare written answers with the sample.`}
      actions={
        <button type="button" onClick={() => generate(true)} className={buttonStyles.ghost}>
          <Sparkles className="size-4" aria-hidden="true" /> New quiz
        </button>
      }
    >
      {error && <div className="mb-6"><ErrorNotice message={error} /></div>}

      {submitted && (
        <section aria-live="polite" className="mb-8 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm text-ink-soft">Your score</p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-[-0.02em]">
              {score}<span className="text-2xl text-muted"> / {scored.length}</span>
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {scored.length === 0 ? "This quiz has no auto-scored questions." : score / scored.length >= 0.8 ? "Strong result. Review the ones you missed below." : "Review the explanations below, then try again."}
            </p>
          </div>
          <button type="button" onClick={retake} className={buttonStyles.primary}>
            <RotateCcw className="size-4" aria-hidden="true" /> Retake quiz
          </button>
        </section>
      )}

      <ol className="space-y-5">
        {quiz.map((q, i) => (
          <li key={`${q.id}-${i}`}>
            <QuestionCard q={q} index={i} answer={answers[i] ?? ""} submitted={submitted} onAnswer={(v) => setAnswer(i, v)} />
          </li>
        ))}
      </ol>

      {!submitted && (
        <div className="sticky bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-20 -mx-2 mt-8 flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-3 shadow-[0_10px_30px_-6px_#17262b33,0_2px_6px_#17262b14] sm:-mx-4 sm:px-6 md:bottom-4 lg:-mx-6">
          <p className="text-sm text-ink-soft" aria-live="polite">
            Answered <span className="font-semibold tabular-nums text-ink">{answered}</span> of {quiz.length}
          </p>
          <button type="button" onClick={submit} disabled={answered === 0} className={buttonStyles.primary}>
            Check answers
          </button>
        </div>
      )}
    </Page>
  );
}

function QuestionCard({ q, index, answer, submitted, onAnswer }: {
  q: Question;
  index: number;
  answer: string;
  submitted: boolean;
  onAnswer: (value: string) => void;
}) {
  // null = not scored (written/code, unanswered, or not submitted yet)
  const scoredResult = submitted && SCORED.has(q.type) && answer.trim() ? isCorrect(q, answer) : null;
  const skipped = submitted && SCORED.has(q.type) && !answer.trim();
  const field = "w-full rounded-lg border border-line-strong bg-surface p-3.5 text-[0.95rem] text-ink outline-none focus:border-pine disabled:bg-paper";

  return (
    <fieldset className={`rounded-2xl border bg-surface p-5 sm:p-6 ${scoredResult === null ? "border-line" : scoredResult ? "border-success" : "border-danger"}`}>
      <legend className="sr-only">Question {index + 1}</legend>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="text-ink-soft">Question {index + 1}</span>
        <span className={`rounded-full px-2 py-0.5 capitalize ${DIFFICULTY_STYLE[q.difficulty?.toLowerCase()] ?? "bg-paper text-ink-soft"}`}>{q.difficulty}</span>
        <span className="rounded-full bg-paper px-2 py-0.5 text-ink-soft">{TYPE_LABEL[q.type]}</span>
        {scoredResult !== null && (
          <span className={`ml-auto inline-flex items-center gap-1 ${scoredResult ? "text-success" : "text-danger"}`}>
            {scoredResult ? <Check className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
            {scoredResult ? "Correct" : "Incorrect"}
          </span>
        )}
        {skipped && <span className="ml-auto text-muted">Not answered</span>}
      </div>
      <p className="whitespace-pre-wrap text-[1.05rem] font-medium leading-relaxed text-ink">{q.question}</p>

      <div className="mt-4">
        {q.type === "multiple_choice" && (
          <div className="grid gap-2.5">
            {q.options.map((option, optIdx) => {
              const selected = answer === String(optIdx);
              const right = optIdx === q.correct_index;
              const state = submitted
                ? right
                  ? "border-success bg-success-tint"
                  : selected
                    ? "border-danger bg-danger-tint"
                    : "border-line opacity-70"
                : selected
                  ? "border-pine bg-pine-tint"
                  : "border-line hover:border-line-strong";
              return (
                <label key={optIdx} className={`flex items-start gap-3 rounded-xl border p-3.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-pine ${submitted ? "" : "cursor-pointer"} ${state}`}>
                  <input type="radio" name={`q-${index}`} value={optIdx} checked={selected} disabled={submitted} onChange={() => onAnswer(String(optIdx))} className="sr-only" />
                  <span className={`grid size-7 shrink-0 place-items-center rounded-md border text-sm font-bold ${selected ? "border-pine bg-pine text-white" : "border-line-strong text-ink-soft"}`}>
                    {LETTERS[optIdx]}
                  </span>
                  <span className="pt-0.5 text-[0.95rem] leading-relaxed text-ink">{option}</span>
                </label>
              );
            })}
          </div>
        )}

        {q.type === "integer" && (
          <input type="number" inputMode="decimal" aria-label="Your answer" placeholder="Your answer" value={answer} disabled={submitted} onChange={(e) => onAnswer(e.target.value)} className={`${field} sm:max-w-xs`} />
        )}

        {q.type === "written" && (
          <textarea aria-label="Your answer" placeholder="Write your answer" rows={4} value={answer} disabled={submitted} onChange={(e) => onAnswer(e.target.value)} className={field} />
        )}

        {q.type === "code" && (
          <textarea aria-label="Your code" placeholder="// Your code" rows={6} spellCheck={false} value={answer} disabled={submitted} onChange={(e) => onAnswer(e.target.value)} className={`${field} font-mono text-sm`} />
        )}
      </div>

      {submitted && (
        <div className="mt-5 space-y-3 border-t border-line pt-4 text-[0.95rem]">
          {q.type === "integer" && (
            <p><span className="font-semibold">Answer:</span> <span className="font-mono">{q.correct_answer}</span></p>
          )}
          {q.type === "written" && (
            <div>
              <p className="font-semibold">Sample answer</p>
              <p className="mt-1 whitespace-pre-wrap font-serif leading-relaxed text-ink-soft">{q.sample_answer}</p>
            </div>
          )}
          {q.type === "code" && (
            <div>
              <p className="font-semibold">Sample solution</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-4 font-mono text-sm text-white">{q.sample_solution}</pre>
            </div>
          )}
          {q.explanation && <p className="font-serif leading-relaxed text-ink-soft"><span className="font-sans font-semibold text-ink">Why:</span> {q.explanation}</p>}
        </div>
      )}
    </fieldset>
  );
}
