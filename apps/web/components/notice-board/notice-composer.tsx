"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  NOTICE_BODY_MAX, NOTICE_TITLE_MAX, POLL_OPTION_MAX, POLL_OPTIONS_MAX, POLL_OPTIONS_MIN, cleanLine,
} from "@repo/shared";
import type { NoticeDraft } from "../../hooks/use-badge-and-notices";

// The form for a new announcement or poll, and for editing one (text, pin and a poll's closing
// time; a poll's options can't change once people may have voted).

const HOUR = 60 * 60 * 1000;
export const CLOSE_CHOICES = [
  { id: "none", label: "No closing time" },
  { id: "1h", label: "In 1 hour" },
  { id: "eod", label: "End of today" },
  { id: "1d", label: "In 1 day" },
  { id: "1w", label: "In 1 week" },
] as const;
type CloseChoice = (typeof CLOSE_CHOICES)[number]["id"] | "keep";

function closingTime(choice: CloseChoice, now: number): number | null | undefined {
  switch (choice) {
    case "keep": return undefined;
    case "none": return null;
    case "1h": return now + HOUR;
    case "1d": return now + 24 * HOUR;
    case "1w": return now + 7 * 24 * HOUR;
    case "eod": {
      const end = new Date(now);
      end.setHours(23, 59, 0, 0);
      // Late at night "end of today" is too close: close at the same time tomorrow instead.
      return end.getTime() - now < 10 * 60 * 1000 ? end.getTime() + 24 * HOUR : end.getTime();
    }
  }
}

export type ComposerResult =
  | NoticeDraft
  | { action: "edit"; title: string; body: string; pinned: boolean; closesAt?: number | null };

const inputClass =
  "w-full rounded-lg border border-[#e3ded4] bg-white px-2.5 py-1.5 text-[13px] text-[#12151c] placeholder:text-[#a3a8b1] focus:border-[#12151c] focus:outline-none focus:ring-2 focus:ring-[#12151c]/10";

export function NoticeComposer({
  editing,
  sending,
  onSubmit,
  onCancel,
}: {
  // Set when editing: the post's current text and kind.
  editing?: { kind: "announcement" | "poll"; title: string; body: string; pinned: boolean };
  sending?: boolean;
  onSubmit: (result: ComposerResult) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<"announcement" | "poll">(editing?.kind ?? "announcement");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [options, setOptions] = useState(["", ""]);
  const [close, setClose] = useState<CloseChoice>(editing ? "keep" : "none");
  const isPoll = kind === "poll";

  const cleanOptions = options.map(cleanLine);
  const optionsOk = editing
    || (cleanOptions.every(Boolean) && new Set(cleanOptions.map((option) => option.toLowerCase())).size === cleanOptions.length);
  const canSend = !sending && cleanLine(title).length > 0 && (!isPoll || optionsOk);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    const closesAt = isPoll ? closingTime(close, Date.now()) : undefined;
    if (editing) {
      onSubmit({ action: "edit", title, body, pinned, ...(closesAt !== undefined ? { closesAt } : {}) });
    } else if (isPoll) {
      onSubmit({ action: "poll", title, body, pinned, options: cleanOptions, closesAt: closesAt ?? null });
    } else {
      onSubmit({ action: "announce", title, body, pinned });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-xl border border-[#e3ded4] bg-[#fffdf8] p-3 shadow-[0_6px_18px_-12px_rgba(60,40,20,0.35)]">
      {!editing && (
        <div role="radiogroup" aria-label="Kind of post" className="grid grid-cols-2 gap-1 rounded-lg bg-[#f1ece3] p-1">
          {(["announcement", "poll"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => setKind(option)}
              className={`cursor-pointer rounded-md py-1 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${
                kind === option ? "bg-white text-[#12151c] shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-[#7a6f60] hover:text-[#12151c]"
              }`}
            >
              {option === "announcement" ? "Announcement" : "Poll"}
            </button>
          ))}
        </div>
      )}

      <label className="block">
        <span className="mb-1 flex justify-between text-[11px] font-semibold text-[#5c5346]">
          {isPoll ? "Question" : "Title"}
          <span className="font-mono font-normal tabular-nums text-[#a3a8b1]">{title.length}/{NOTICE_TITLE_MAX}</span>
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={NOTICE_TITLE_MAX}
          placeholder={isPoll ? "Where should we have Friday lunch?" : "Release freeze starts Thursday"}
          className={inputClass}
          autoFocus
        />
      </label>

      <label className="block">
        <span className="mb-1 flex justify-between text-[11px] font-semibold text-[#5c5346]">
          {isPoll ? "Note (optional)" : "Details"}
          <span className="font-mono font-normal tabular-nums text-[#a3a8b1]">{body.length}/{NOTICE_BODY_MAX}</span>
        </span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={NOTICE_BODY_MAX}
          rows={isPoll ? 2 : 3}
          className={`${inputClass} resize-none leading-5`}
        />
      </label>

      {isPoll && !editing && (
        <fieldset>
          <legend className="mb-1 text-[11px] font-semibold text-[#5c5346]">Options ({POLL_OPTIONS_MIN} to {POLL_OPTIONS_MAX})</legend>
          <div className="space-y-1.5">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <input
                  value={option}
                  onChange={(event) => setOptions((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                  maxLength={POLL_OPTION_MAX}
                  aria-label={`Option ${index + 1}`}
                  placeholder={`Option ${index + 1}`}
                  className={inputClass}
                />
                {options.length > POLL_OPTIONS_MIN && (
                  <button
                    type="button"
                    onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove option ${index + 1}`}
                    className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-[#8a909b] hover:bg-[#f1ece3] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < POLL_OPTIONS_MAX && (
            <button
              type="button"
              onClick={() => setOptions((current) => [...current, ""])}
              className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-[#5c5346] hover:bg-[#f1ece3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
            >
              <Plus size={13} aria-hidden="true" /> Add option
            </button>
          )}
          {!optionsOk && cleanOptions.every(Boolean) && (
            <p className="mt-1 text-[11px] text-[#b4441f]">Each option must be different.</p>
          )}
        </fieldset>
      )}

      {isPoll && (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-[#5c5346]">Closes</span>
          <select value={close} onChange={(event) => setClose(event.target.value as CloseChoice)} className={`${inputClass} cursor-pointer`}>
            {editing && <option value="keep">Keep as it is</option>}
            {CLOSE_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </select>
        </label>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <label htmlFor={`${id}-pin`} className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-[#5c5346]">
          <input id={`${id}-pin`} type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} className="h-3.5 w-3.5 accent-[#c2412d]" />
          Pin to the top
        </label>
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#5c6371] hover:bg-[#f1ece3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="cursor-pointer rounded-lg bg-[#12151c] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#2a2f3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editing ? "Save" : sending ? "Posting…" : "Post"}
          </button>
        </span>
      </div>
    </form>
  );
}
