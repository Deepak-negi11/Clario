"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Mail, PenLine, Send, X } from "lucide-react";
import { sendSpaceEmail } from "../../lib/space-api";
import { getAuthToken } from "../../lib/auth-token";

// Mirrors the server limits in apps/server/src/email/email.ts.
const MAX_SUBJECT_LENGTH = 150;
const MAX_BODY_LENGTH = 5000;

type Step = "to" | "subject" | "body";

const STEPS: { id: Step; label: string }[] = [
  { id: "to", label: "To" },
  { id: "subject", label: "Subject" },
  { id: "body", label: "Message" },
];

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "sent"; to: string };

type Person = {
  id: string;
  name: string;
  isSelf: boolean;
  isNearby?: boolean;
};

type EmailComposerProps = {
  open: boolean;
  spaceId: string;
  people: Person[];
  onClose: () => void;
};

const fieldLabel = "font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#5c6371]";
const fieldInput =
  "w-full rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2.5 text-[13px] text-[#12151c] outline-none transition placeholder:text-[#6b7180] focus:border-[#12151c]/50 focus:bg-white focus:ring-2 focus:ring-[#12151c]/10 disabled:opacity-60";
const primaryButton =
  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#12151c] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#6b7180] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] motion-reduce:transition-none";
const iconButton =
  "grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] disabled:cursor-not-allowed disabled:opacity-50";
const enterTransition =
  "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";
// Same timing as enterTransition, for the step that slides out.
const SLIDE_TIMING: KeyframeAnimationOptions = { duration: 300, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

export function EmailComposer({ open, spaceId, people, onClose }: EmailComposerProps) {
  const ids = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const doneRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const stepAreaRef = useRef<HTMLDivElement | null>(null);
  const liveStepRef = useRef<HTMLDivElement | null>(null);
  // A copy of the step that is leaving, taken just before the switch, and the height the area had then.
  const leavingRef = useRef<{ copy: HTMLElement; height: number; forward: boolean } | null>(null);

  const [step, setStep] = useState<Step>("to");
  const [forward, setForward] = useState(true);
  const [recipient, setRecipient] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendState, setSendState] = useState<SendState>({ kind: "idle" });
  const [sendShortcut] = useState(() =>
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ Enter" : "Ctrl+Enter",
  );

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const previousStep = sendState.kind === "sent" ? undefined : STEPS[stepIndex - 1];
  const isSending = sendState.kind === "sending";
  const recipientLeft = !!recipient && !people.some((person) => person.id === recipient.id);

  // Other people first (nearby ones on top), yourself last.
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => Number(a.isSelf) - Number(b.isSelf) || Number(!!b.isNearby) - Number(!!a.isNearby)),
    [people],
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? sortedPeople.filter((person) => person.name.toLowerCase().includes(needle)) : sortedPeople;
  }, [sortedPeople, query]);

  const highlighted = matches[Math.min(activeIndex, matches.length - 1)];

  const isComplete: Record<Step, boolean> = {
    to: !!recipient && !recipientLeft,
    subject: subject.trim().length > 0,
    body: body.trim().length > 0,
  };

  // Remember what had focus when the panel opened, and hand it back on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      return;
    }
    if (panelRef.current?.contains(document.activeElement)) restoreFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (sendState.kind === "sent") doneRef.current?.focus();
    else if (step === "to") searchRef.current?.focus();
    else if (step === "subject") subjectRef.current?.focus();
    else bodyRef.current?.focus();
  }, [open, step, sendState.kind]);

  // Escape also closes the panel when focus is out on the map.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Steps take turns in one spot: going forward, the new step pushes in from the left (its starting:
  // classes) while this copy of the old one slides out to the right; going back runs the other way.
  useLayoutEffect(() => {
    const leaving = leavingRef.current;
    const area = stepAreaRef.current;
    leavingRef.current = null;
    if (!leaving || !area) return;

    area.append(leaving.copy);
    area.style.overflow = "clip";
    const exit = leaving.copy.animate(
      [{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${leaving.forward ? 100 : -100}%)`, opacity: 0 }],
      SLIDE_TIMING,
    );
    exit.onfinish = exit.oncancel = () => leaving.copy.remove();
    const resize = area.animate([{ height: `${leaving.height}px` }, { height: `${area.offsetHeight}px` }], SLIDE_TIMING);
    resize.onfinish = resize.oncancel = () => {
      area.style.overflow = "";
    };
  }, [step]);

  // A frozen, hidden-from-assistive-tech copy of the visible step, for the slide-out.
  function copyLiveStep(forward: boolean) {
    const live = liveStepRef.current;
    const area = stepAreaRef.current;
    if (!live || !area || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

    const copy = live.cloneNode(true) as HTMLElement;
    const fields = live.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((field, index) => {
      field.value = fields[index]?.value ?? "";
    });
    // Ids would clash with the live step's labels and aria links.
    for (const node of [copy, ...copy.querySelectorAll("[id]")]) node.removeAttribute("id");
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    Object.assign(copy.style, { position: "absolute", top: "0", left: "0", right: "0", transition: "none" });
    return { copy, height: area.offsetHeight, forward };
  }

  function goTo(target: Step) {
    if (isSending) return;
    if (target === "to") {
      setQuery("");
      const index = sortedPeople.findIndex((person) => person.id === recipient?.id);
      setActiveIndex(Math.max(0, index));
    }
    if (target !== step) {
      const isForward = STEPS.findIndex((item) => item.id === target) > stepIndex;
      setForward(isForward);
      leavingRef.current = copyLiveStep(isForward);
    }
    setSendState({ kind: "idle" });
    setStep(target);
  }

  // After a step, jump to the first later step that still needs input (or the message, where Send lives).
  function advanceFrom(current: Step, completed: Partial<Record<Step, boolean>> = {}) {
    const done = { ...isComplete, ...completed };
    const later = STEPS.slice(STEPS.findIndex((item) => item.id === current) + 1);
    goTo(later.find((item) => !done[item.id])?.id ?? "body");
  }

  function pickRecipient(person: Person) {
    setRecipient({ id: person.id, name: person.name });
    setQuery("");
    advanceFrom("to", { to: true });
  }

  function resetDraft() {
    setRecipient(null);
    setSubject("");
    setBody("");
    setQuery("");
    setActiveIndex(0);
    setSendState({ kind: "idle" });
    setStep("to");
  }

  function close() {
    if (sendState.kind === "sent") resetDraft();
    onClose();
  }

  async function send() {
    if (!recipient || !isComplete.to || !isComplete.subject || !isComplete.body || isSending) return;
    const token = getAuthToken();
    if (!token) {
      setSendState({ kind: "error", message: "You are signed out. Sign in again to send email." });
      return;
    }

    setSendState({ kind: "sending" });
    try {
      await sendSpaceEmail(token, spaceId, { recipientId: recipient.id, subject, body });
      setSendState({ kind: "sent", to: recipient.name });
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Could not reach the server. Check your connection and try again."
          : error instanceof Error
            ? error.message
            : "Could not send this email.";
      setSendState({ kind: "error", message });
    }
  }

  function handlePanelKeyDown(event: React.KeyboardEvent) {
    // Keep typing out of the Phaser scene, which listens for arrow keys on window.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (Math.min(index, matches.length - 1) + delta + matches.length) % matches.length);
      return;
    }
    const advances = event.key === "Enter" || (event.key === "Tab" && !event.shiftKey);
    if (advances && highlighted) {
      event.preventDefault();
      pickRecipient(highlighted);
    } else if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  function handleSubjectKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const advances = event.key === "Enter" || (event.key === "Tab" && !event.shiftKey);
    if (event.key === "Enter") event.preventDefault();
    if (advances && isComplete.subject) {
      event.preventDefault();
      advanceFrom("subject");
    }
  }

  function handleBodyKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  }

  // The earlier steps are gone from view, so later steps say who (and what) the email is for.
  const recipientNote = recipient && (
    <span className={`min-w-0 truncate text-[11px] font-medium ${recipientLeft ? "text-[#b42318]" : "text-[#5c6371]"}`}>
      to {recipient.name}
      {recipientLeft ? " (left the space)" : step === "body" && subject.trim() && ` · ${subject.trim()}`}
    </span>
  );

  // Same slot as the people panel; it slides out from under the sidebar rail and is only as tall as its content.
  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-labelledby={`${ids}-title`}
      inert={!open}
      onKeyDown={handlePanelKeyDown}
      className={`pointer-events-auto absolute left-[76px] top-3 z-[65] flex max-h-[calc(100dvh-1.5rem)] w-[min(23rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[calc(100%+76px)] opacity-0"
      }`}
    >
      <header className="flex items-center justify-between border-b border-[#eceef1] px-4 py-3">
        <div className="flex items-center gap-2">
          {previousStep ? (
            <button
              type="button"
              onClick={() => goTo(previousStep.id)}
              disabled={isSending}
              aria-label={`Back to ${previousStep.id === "to" ? "recipient" : previousStep.label.toLowerCase()}`}
              title="Back"
              className={`-my-1 -ml-1.5 -mr-0.5 ${iconButton}`}
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          ) : (
            <Mail size={16} aria-hidden="true" />
          )}
          <h2 id={`${ids}-title`} className="text-sm font-semibold">
            New email
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {sendState.kind !== "sent" && (
            <div className="flex items-center gap-1" aria-hidden="true">
              {STEPS.map((item, index) => (
                <span
                  key={item.id}
                  className={`h-1.5 w-1.5 transition-colors duration-300 ${index <= stepIndex ? "bg-[#12151c]" : "bg-[#d5d8de]"}`}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Close email (Esc)"
            title="Close (Esc)"
            className={iconButton}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {sendState.kind === "sent" ? (
        <div className={`flex flex-col items-center px-6 py-8 text-center starting:translate-y-1 starting:opacity-0 ${enterTransition}`}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#12151c] text-white">
            <Check size={20} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold" role="status">
            Sent to {sendState.to}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#5c6371]">Their reply will land in your own inbox.</p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={close}
              className="h-9 cursor-pointer rounded-xl border border-[#e6e7ea] px-3.5 text-[13px] font-semibold text-[#5c6371] transition hover:bg-[#f7f8fa] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]"
            >
              Close
            </button>
            <button ref={doneRef} type="button" onClick={resetDraft} className={primaryButton}>
              <PenLine size={15} aria-hidden="true" />
              Write another
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain">
            <div ref={stepAreaRef} className="relative flex min-h-0 flex-col">
              <div
                key={step}
                ref={liveStepRef}
                className={`flex min-h-0 flex-col px-4 pb-4 pt-3.5 starting:opacity-0 ${forward ? "starting:-translate-x-full" : "starting:translate-x-full"} ${enterTransition}`}
              >
                {step === "to" && (
                  <div className="flex min-h-0 flex-col gap-2">
                    <label htmlFor={`${ids}-to`} className={fieldLabel}>
                      To
                    </label>
                    <input
                      ref={searchRef}
                      id={`${ids}-to`}
                      name="recipient-search"
                      role="combobox"
                      aria-expanded="true"
                      aria-controls={`${ids}-people`}
                      aria-autocomplete="list"
                      aria-activedescendant={highlighted ? `${ids}-person-${highlighted.id}` : undefined}
                      aria-describedby={`${ids}-to-hint`}
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search people in this space"
                      autoComplete="off"
                      enterKeyHint="next"
                      className={fieldInput}
                    />
                    <ul id={`${ids}-people`} role="listbox" aria-label="People in this space" className="-mx-1 min-h-0 shrink overflow-y-auto overscroll-contain py-0.5">
                      {matches.map((person, index) => {
                        const active = person.id === highlighted?.id;
                        return (
                          <li
                            key={person.id}
                            ref={(element) => {
                              optionRefs.current[index] = element;
                            }}
                            id={`${ids}-person-${person.id}`}
                            role="option"
                            aria-selected={active}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => pickRecipient(person)}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] transition-colors ${
                              active ? "bg-[#12151c] text-white" : "text-[#12151c]"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                                active ? "bg-white text-[#12151c]" : "bg-[#eceef1] text-[#12151c]"
                              }`}
                            >
                              {person.name.trim().charAt(0).toUpperCase() || "?"}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium">{person.name}</span>
                            {(person.isSelf || person.isNearby) && (
                              <span className={`shrink-0 text-[11px] font-medium ${active ? "text-white/75" : "text-[#5c6371]"}`}>
                                {person.isSelf ? "You" : "Nearby"}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {matches.length === 0 && (
                      <p className="px-1 py-2 text-xs text-[#5c6371]">
                        {query.trim() ? `Nobody here matches "${query.trim()}".` : "Nobody else is in this space yet."}
                      </p>
                    )}
                    <p id={`${ids}-to-hint`} className="text-[11px] leading-4 text-[#5c6371]">
                      You can email anyone who is in this space right now. Enter picks the highlighted person.
                    </p>
                  </div>
                )}

                {step === "subject" && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor={`${ids}-subject`} className={fieldLabel}>
                        Subject
                      </label>
                      {recipientNote}
                    </div>
                    <input
                      ref={subjectRef}
                      id={`${ids}-subject`}
                      name="subject"
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      onKeyDown={handleSubjectKeyDown}
                      maxLength={MAX_SUBJECT_LENGTH}
                      placeholder="What is this about?"
                      autoComplete="off"
                      enterKeyHint="next"
                      className={fieldInput}
                    />
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-[#5c6371]">Enter or Tab to continue</p>
                      <button type="button" onClick={() => advanceFrom("subject")} disabled={!isComplete.subject} className={primaryButton}>
                        Next
                        <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                {step === "body" && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor={`${ids}-body`} className={fieldLabel}>
                        Message
                      </label>
                      {recipientNote}
                    </div>
                    <textarea
                      ref={bodyRef}
                      id={`${ids}-body`}
                      name="message"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      onKeyDown={handleBodyKeyDown}
                      maxLength={MAX_BODY_LENGTH}
                      disabled={isSending}
                      rows={7}
                      placeholder={recipient ? `Write to ${recipient.name}…` : "Write your message…"}
                      aria-describedby={`${ids}-body-hint`}
                      className={`${fieldInput} h-44 resize-none leading-relaxed`}
                    />
                    <div id={`${ids}-body-hint`} className="flex items-center justify-between text-[11px] text-[#5c6371]">
                      <span className="pointer-coarse:invisible">{sendShortcut} to send</span>
                      <span className="tabular-nums">
                        {body.length.toLocaleString()} / {MAX_BODY_LENGTH.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {step === "body" && (
            <footer className="flex flex-col gap-2.5 border-t border-[#eceef1] bg-white px-4 py-3">
              {(sendState.kind === "error" || recipientLeft) && (
                <p role="alert" className="rounded-xl bg-[#fef3f2] px-3 py-2 text-xs leading-5 text-[#b42318]">
                  {recipientLeft
                    ? `${recipient?.name ?? "That person"} has left the space. Pick someone who is still here.`
                    : sendState.kind === "error" && sendState.message}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] leading-4 text-[#5c6371]">Replies go to your account email.</p>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={isSending || !isComplete.to || !isComplete.subject || !isComplete.body}
                  className={primaryButton}
                >
                  {isSending ? (
                    <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Send size={15} aria-hidden="true" />
                  )}
                  {isSending ? "Sending…" : "Send"}
                </button>
              </div>
            </footer>
          )}
        </>
      )}
    </section>
  );
}
