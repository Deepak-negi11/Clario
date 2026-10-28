"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, CheckCircle2, Lightbulb, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import {
  CATEGORY_LABELS,
  FEEDBACK_CATEGORIES,
  MAX_DRAFT_LENGTH,
  MAX_SENDS,
  PASS_SCORE,
  weakestCategory,
  xpForCompletion,
  type Mission,
  type MissionFeedback,
  type MissionSendResponse,
} from "@repo/shared";
import { emptyRun, readRuns, saveRun, type MissionRun, type ThreadItem } from "../../lib/missions/progress";

// One mission as a simulated chat (PS7_BUILD_BRIEF.md section 7). The learner's message goes
// to the coach first; weak messages get feedback and another try, and only a passing message
// gets the coworker's answer and completes the mission.

const openingThread = (mission: Mission): ThreadItem[] =>
  mission.openingMessage ? [{ kind: "coworker", text: mission.openingMessage }] : [];

const firstName = (name: string) => name.split(" ")[0] ?? name;

function scoreTone(score: number) {
  if (score >= PASS_SCORE) return "bg-[#e7f6ee] text-[#17663d]";
  if (score >= 4) return "bg-[#fdf3e1] text-[#8a5a00]";
  return "bg-[#fdecec] text-[#b42318]";
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The learner's message with the phrases the coach flagged underlined.
function Highlighted({ text, phrases }: { text: string; phrases: string[] }) {
  if (!phrases.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${phrases.map(escapeRegex).join("|")})`, "g"));
  return (
    <>
      {parts.map((part, index) =>
        phrases.includes(part) ? (
          <mark key={index} className="rounded-sm bg-[#ffd8a8]/40 text-inherit underline decoration-[#ffb35c] decoration-2 underline-offset-4">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function FeedbackCard({ feedback, source, passed }: { feedback: MissionFeedback; source: "ai" | "rules"; passed: boolean }) {
  const weakest = weakestCategory(feedback);
  const needsWork = FEEDBACK_CATEGORIES.filter((category) => feedback[category].score < PASS_SCORE);
  return (
    <section aria-label="Feedback" className="rounded-xl border border-[#e3e6ee] bg-[#f8f9fc] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#12151c]">
          <Sparkles size={15} className="text-[#3a6ee8]" aria-hidden="true" />
          Feedback
        </h3>
        <span className="text-[11px] text-[#8a909b]">{source === "ai" ? "Graded by AI coach" : "Graded by rules (backup)"}</span>
      </div>
      {feedback.summary && <p className="mt-1.5 text-[13px] leading-5 text-[#2b303b]">{feedback.summary}</p>}
      <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Scores out of 10">
        {FEEDBACK_CATEGORIES.map((category) => (
          <li key={category} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${scoreTone(feedback[category].score)}`}>
            {CATEGORY_LABELS[category]} {feedback[category].score}/10
          </li>
        ))}
      </ul>
      {!passed && (
        <>
          <p className="mt-2.5 text-xs leading-5 text-[#4a505e]">
            <span className="font-semibold text-[#12151c]">Suggestion: </span>
            {feedback[weakest].tip}
          </p>
          {needsWork.length > 1 && (
            <details className="group mt-1.5 text-xs text-[#4a505e]">
              <summary className="cursor-pointer select-none font-medium text-[#3a6ee8] hover:underline">All tips</summary>
              <ul className="mt-1.5 space-y-1">
                {needsWork.map((category) => (
                  <li key={category}>
                    <span className="font-semibold text-[#12151c]">{CATEGORY_LABELS[category]}: </span>
                    {feedback[category].tip}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export function MissionChat({
  mission,
  number,
  showXp,
  nextHref,
  onRunChange,
  onNext,
  embedded = false,
}: {
  mission: Mission;
  number: number;
  showXp: boolean;
  nextHref?: string;
  onRunChange?: (run: MissionRun) => void;
  /** "Next mission" calls this instead of following nextHref (a link would leave the map). */
  onNext?: () => void;
  /** Inside another panel (the Practice Session): no card border or shadow of its own. */
  embedded?: boolean;
}) {
  const [run, setRun] = useState<MissionRun>(() => ({ ...emptyRun(), thread: openingThread(mission) }));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [showExample, setShowExample] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const name = firstName(mission.coworker.name);

  // Saved progress loads after the first render, so server and browser render the same page.
  useEffect(() => {
    const saved = readRuns()[mission.id];
    if (saved) setRun(saved);
  }, [mission.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [run.thread.length, sending]);

  const update = (next: MissionRun) => {
    setRun(next);
    saveRun(mission.id, next);
    onRunChange?.(next);
  };

  const outOfTries = !run.completed && run.sends >= MAX_SENDS;
  const canSend = !run.completed && !outOfTries && !sending && draft.trim().length > 0;

  async function send() {
    const text = draft.trim();
    if (!canSend) return;
    const before = run;
    setSending(true);
    setError(null);
    const withMessage: MissionRun = { ...run, thread: [...run.thread, { kind: "user", text }] };
    setRun(withMessage);
    try {
      const response = await fetch("/api/missions/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId: mission.id, draft: text }),
      });
      const body = (await response.json()) as MissionSendResponse & { error?: string };
      if (!response.ok) {
        setRun(before);
        setError(body.error ?? "The coach couldn't read that. Try again.");
        return;
      }
      const sends = before.sends + 1;
      const thread: ThreadItem[] = [...withMessage.thread, { kind: "feedback", feedback: body.feedback, source: body.source }];
      if (body.passed && body.reply) thread.push({ kind: "coworker", text: body.reply, source: body.replySource ?? "seeded" });
      update({ thread, sends, completed: body.passed, xp: body.passed ? xpForCompletion(sends) : 0 });
      setDraft("");
    } catch {
      setRun(before);
      setError("Couldn't reach the coach. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    update({ ...emptyRun(), thread: openingThread(mission) });
    setDraft("");
    setError(null);
    setHintLevel(0);
    setShowExample(false);
  }

  return (
    <article
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-white text-[#12151c] ${
        embedded ? "" : "rounded-2xl border border-black/5 shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)]"
      }`}
    >
      <header className="flex items-center gap-3 border-b border-[#eceef1] px-5 py-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e9e4fb] text-lg font-semibold text-[#3d2f8f]" aria-hidden="true">
          {name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{mission.coworker.name}</h2>
          <p className="truncate text-xs text-[#6b7280]">{mission.coworker.role} · Simulated chat</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f1f3f6] px-2.5 py-1 text-xs font-semibold text-[#3b414c]">Mission {number}</span>
      </header>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4" aria-live="polite">
        <section aria-label="Your situation" className="rounded-xl bg-[#f6f4ee] px-4 py-3 text-[13px] leading-5 text-[#3b3a35]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7f5f]">{mission.title}</p>
          <p className="mt-1">{mission.situation}</p>
          {mission.context && (
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 px-3 py-2 font-mono text-[12px] leading-5 text-[#3b3a35]">{mission.context}</pre>
          )}
          <p className="mt-2">
            <span className="font-semibold">Goal: </span>
            {mission.goal}
          </p>
        </section>

        {mission.previousUserMessage && (
          <div className="flex flex-col items-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#12151c]/60 px-3.5 py-2 text-[13px] leading-5 text-white">{mission.previousUserMessage}</p>
            <span className="mt-0.5 px-1 text-[10px] text-[#8a909b]">No reply yet</span>
          </div>
        )}

        {run.thread.map((item, index) => {
          if (item.kind === "coworker") {
            return (
              <div key={index} className="flex flex-col items-start">
                <span className="mb-0.5 px-1 text-[11px] font-medium text-[#8a909b]">{name}</span>
                <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#f1f3f6] px-3.5 py-2 text-[13px] leading-5">{item.text}</p>
              </div>
            );
          }
          if (item.kind === "user") {
            const next = run.thread[index + 1];
            const phrases = next?.kind === "feedback" ? next.feedback.problemPhrases : [];
            return (
              <div key={index} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#12151c] px-3.5 py-2 text-[13px] leading-5 text-white">
                  <Highlighted text={item.text} phrases={phrases} />
                </p>
              </div>
            );
          }
          const passedHere = FEEDBACK_CATEGORIES.every((category) => item.feedback[category].score >= PASS_SCORE);
          return <FeedbackCard key={index} feedback={item.feedback} source={item.source} passed={passedHere} />;
        })}

        {sending && (
          <p className="flex items-center gap-2 text-xs text-[#6b7280]" role="status">
            <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            The coach is reading your message…
          </p>
        )}

        {run.completed && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cdebd9] bg-[#eefaf3] px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#17663d]">
              <CheckCircle2 size={18} aria-hidden="true" />
              Mission completed
            </p>
            {showXp && (
              <p className="text-sm font-semibold tabular-nums text-[#17663d]">
                +{run.xp} XP{run.sends === 1 ? " (first try bonus)" : ""}
              </p>
            )}
          </div>
        )}

        {outOfTries && (
          <p className="rounded-xl border border-[#f3dfb5] bg-[#fdf6e7] px-4 py-3 text-xs leading-5 text-[#6b4e10]" role="status">
            No tries left for this round. Look at the example reply, then start again.
          </p>
        )}

        {(hintLevel > 0 || showExample) && (
          <section aria-label="Help" className="space-y-1.5 rounded-xl border border-dashed border-[#d6dae3] px-4 py-3 text-xs leading-5 text-[#4a505e]">
            {mission.hints.slice(0, hintLevel).map((hint, index) => (
              <p key={index}>
                <span className="font-semibold text-[#12151c]">Hint {index + 1}: </span>
                {hint}
              </p>
            ))}
            {showExample && (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-[#12151c]">Example reply: </span>
                {mission.exampleReply}
              </p>
            )}
          </section>
        )}
      </div>

      <footer className="border-t border-[#eceef1] bg-[#fafbfc] px-4 py-3">
        {run.completed || outOfTries ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {outOfTries && !showExample && (
              <button type="button" onClick={() => setShowExample(true)} className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-[#3b414c] transition hover:bg-[#f1f3f6]">
                See an example
              </button>
            )}
            <button type="button" onClick={reset} className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#3b414c] transition hover:bg-[#f1f3f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]">
              <RotateCcw size={14} aria-hidden="true" />
              {run.completed ? "Practise again" : "Start again"}
            </button>
            {run.completed && onNext && (
              <button
                type="button"
                onClick={onNext}
                className="cursor-pointer rounded-xl bg-[#12151c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]"
              >
                Next mission
              </button>
            )}
            {run.completed && !onNext && nextHref && (
              <Link href={nextHref} className="rounded-xl bg-[#12151c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]">
                Next mission
              </Link>
            )}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor={`draft-${mission.id}`} className="sr-only">
              Your reply to {name}
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id={`draft-${mission.id}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={3}
                maxLength={MAX_DRAFT_LENGTH}
                placeholder={mission.openingMessage ? `Reply to ${name}…` : `Write to ${name}…`}
                className="min-h-[4.5rem] flex-1 resize-y rounded-xl border border-[#e3e6ee] bg-white px-3 py-2 text-[13px] leading-5 outline-none transition placeholder:text-[#8a909b] focus:border-[#12151c]/30"
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send reply"
                className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-[#12151c] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#8a909b]"
              >
                {sending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" />}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6b7280]">
              {hintLevel < (run.sends > 0 ? 2 : 1) && (
                <button type="button" onClick={() => setHintLevel((level) => level + 1)} className="flex cursor-pointer items-center gap-1 font-semibold text-[#3a6ee8] hover:underline">
                  <Lightbulb size={13} aria-hidden="true" />
                  {hintLevel === 0 ? "Hint" : "Another hint"}
                </button>
              )}
              {run.sends > 0 && !showExample && (
                <button type="button" onClick={() => setShowExample(true)} className="cursor-pointer font-semibold text-[#3a6ee8] hover:underline">
                  See an example
                </button>
              )}
              <span className="ml-auto tabular-nums">
                {MAX_SENDS - run.sends} {MAX_SENDS - run.sends === 1 ? "try" : "tries"} left · Ctrl+Enter to send
              </span>
            </div>
            {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
          </form>
        )}
      </footer>
    </article>
  );
}
