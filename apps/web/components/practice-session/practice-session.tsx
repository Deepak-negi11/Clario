"use client";

import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { ArrowUp, Lightbulb, Mic, RotateCcw, SpellCheck, Square, Trash2, Volume2, VolumeX, X } from "lucide-react";
import {
  MENTOR_HISTORY_LIMIT,
  nextMentorState,
  savedTipReply,
  type LanguageFeedback,
  type LanguageIssue,
  type MentorResponse,
  type MentorSource,
  type MentorState,
} from "@repo/shared";
import { isSpeechRecognitionSupported, listen, type ListenSession } from "../../lib/speech/recognition";
import { isSpeechSynthesisSupported, speak, warmUpVoices } from "../../lib/speech/synthesis";
import { answerCompanion } from "../../lib/companions/store";
import { CompanionBar } from "../companions/companion-bar";
import { MayaAvatar } from "./maya-avatar";
import { MissionsTab } from "./missions-tab";

// The Practice Session panel (PS7_BUILD_BRIEF.md section 16): ask Maya by typing or talking,
// she answers in text and out loud; the Missions tab holds the Workplace Quest missions (missions-tab.tsx).
// Render it only in the browser (it reads storage and speech
// support when it mounts): the map opens it on demand, /practice loads it with ssr: false.

// language: Maya's check of the learner's own English, shown under their message.
type ChatItem = { id: string; role: "user" | "mentor"; text: string; source?: MentorSource; language?: LanguageFeedback };
type Settings = { speakReplies: boolean; autoSend: boolean; lang: string };

const HISTORY_KEY = "maya:history";
const SETTINGS_KEY = "maya:settings";
const MAX_STORED = 40;
const MAX_QUESTION = 600;

const GREETING =
  "Hi, I'm Maya. Ask me about workplace messages: asking for help, standups, follow-ups, pull requests. Type, or press the mic and talk.";
const SUGGESTIONS = [
  "How do I ask a senior for help without sounding lost?",
  "What should my standup update include?",
  "Is 'sorry to disturb you' too much?",
];
const SOURCE_LABEL: Record<MentorSource, string> = {
  gemini: "AI mentor (Gemini)",
  local: "AI mentor (local model)",
  "saved-tips": "Saved tip",
};
const MAYA_VOICE = { pitch: 1.05, rate: 1 };
const DEFAULT_SETTINGS: Settings = { speakReplies: true, autoSend: true, lang: "en-IN" };

function readStored<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the session still works, it just isn't remembered.
  }
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

type PracticeSessionProps = {
  onClose?: () => void;
  onStateChange?: (state: MentorState) => void;
};

export function PracticeSession({ onClose, onStateChange }: PracticeSessionProps) {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readStored<Partial<Settings>>(localStorage, SETTINGS_KEY, {}),
  }));
  // Kept for this tab only: free-form chat is where real details are most likely to be typed.
  const [messages, setMessages] = useState<ChatItem[]>(() => readStored<ChatItem[]>(sessionStorage, HISTORY_KEY, []));
  const [state, dispatch] = useReducer(nextMentorState, "idle");
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [canListen] = useState(isSpeechRecognitionSupported);
  const [canSpeak] = useState(isSpeechSynthesisSupported);

  // "maya": ask the mentor. "missions": reply to coworkers and get scored (Workplace Quest).
  const [tab, setTab] = useState<"maya" | "missions">("maya");
  const inputId = useId();
  const tabsId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const listenRef = useRef<{ session: ListenSession | null; token: object } | null>(null);
  const heardRef = useRef("");
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  // The reply being read aloud right now, so its bubble can show "Stop".
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
    writeStored(sessionStorage, HISTORY_KEY, messages.slice(-MAX_STORED));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    settingsRef.current = settings;
    writeStored(localStorage, SETTINGS_KEY, settings);
  }, [settings]);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Escape closes the panel wherever focus is, unless the learner is typing in another box.
  useEffect(() => {
    if (!onClose) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      const inPanel = target instanceof Node && !!sectionRef.current?.contains(target);
      const typingElsewhere =
        !inPanel &&
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (!typingElsewhere) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const stopListening = useCallback(() => {
    const current = listenRef.current;
    listenRef.current = null; // its onEnd will now be ignored
    current?.session?.abort();
  }, []);

  const stopSpeaking = useCallback(() => {
    cancelSpeechRef.current?.();
    cancelSpeechRef.current = null;
    setSpeakingId(null);
  }, []);

  useEffect(() => {
    warmUpVoices();
    inputRef.current?.focus();
    return () => {
      stopListening();
      stopSpeaking();
      requestRef.current?.abort();
    };
  }, [stopListening, stopSpeaking]);

  // Reading aloud uses the browser's own voice, so it costs no AI tokens either way.
  const startSpeech = useCallback((id: string, text: string) => {
    setSpeakingId(id);
    cancelSpeechRef.current = speak(text, { lang: settingsRef.current.lang, ...MAYA_VOICE }, () => {
      cancelSpeechRef.current = null;
      setSpeakingId(null);
      dispatch({ type: "SPEECH_END" });
    });
  }, []);

  // Maya answers in the way she was asked: a spoken question gets a spoken reply (unless her
  // voice is muted); a typed question gets text only, with a Listen button on the reply.
  const say = useCallback((id: string, text: string, spoken: boolean) => {
    if (!spoken || !settingsRef.current.speakReplies || !isSpeechSynthesisSupported()) {
      dispatch({ type: "REPLY", speak: false });
      return;
    }
    dispatch({ type: "REPLY", speak: true });
    startSpeech(id, text);
  }, [startSpeech]);

  function readAloud(id: string, text: string) {
    if (state === "listening" || state === "thinking") return;
    stopSpeaking();
    dispatch({ type: "READ_ALOUD" });
    startSpeech(id, text);
  }

  function stopReading() {
    stopSpeaking();
    dispatch({ type: "SPEECH_END" });
  }

  const ask = useCallback(async (raw: string, mode: "text" | "voice") => {
    const question = raw.trim().slice(0, MAX_QUESTION);
    if (!question || requestRef.current) return;

    stopListening();
    stopSpeaking();
    dispatch({ type: mode === "voice" ? "HEARD" : "SEND_TEXT" });
    setDraft("");
    setHeard("");
    setVoiceError(null);

    // Asking her to walk or play with you in the 3D view, or to stop, is done here, not by the AI.
    const agreed = answerCompanion("maya", question);
    if (agreed) {
      const agreedId = newId();
      setNotice(null);
      setMessages((previous) => [...previous, { id: newId(), role: "user", text: question }, { id: agreedId, role: "mentor", text: agreed }]);
      say(agreedId, agreed, mode === "voice");
      return;
    }

    const history = messagesRef.current.slice(-MENTOR_HISTORY_LIMIT).map(({ role, text }) => ({ role, text }));
    const questionId = newId();
    setMessages((previous) => [...previous, { id: questionId, role: "user", text: question }]);

    const controller = new AbortController();
    requestRef.current = controller;
    let answer: MentorResponse;
    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: question, history, inputMode: mode }),
        signal: controller.signal,
      });
      const body = (await response.json()) as MentorResponse & { error?: string };
      if (!response.ok) {
        setNotice(body.error ?? "Maya couldn't read that question. Try again.");
        dispatch({ type: "REPLY", speak: false });
        return;
      }
      answer = body;
    } catch {
      if (controller.signal.aborted) return; // the panel was closed
      answer = {
        reply: savedTipReply(question),
        source: "saved-tips",
        notice: "Maya can't reach the server right now, so she answers from saved tips.",
      };
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }

    setNotice(answer.notice ?? null);
    const replyId = newId();
    const { language } = answer;
    setMessages((previous) => [
      ...previous.map((item) => (item.id === questionId && language ? { ...item, language } : item)),
      { id: replyId, role: "mentor", text: answer.reply, source: answer.source },
    ]);
    say(replyId, answer.reply, mode === "voice");
  }, [say, stopListening, stopSpeaking]);

  function toggleMic() {
    if (state === "listening") {
      listenRef.current?.session?.stop(); // finishes the turn with what was heard so far
      return;
    }
    if (state === "thinking") return;

    stopSpeaking(); // talking over Maya interrupts her
    setVoiceError(null);
    setHeard("");
    heardRef.current = "";

    const token = {};
    listenRef.current = { session: null, token };
    const isCurrent = () => listenRef.current?.token === token;
    const session = listen(settingsRef.current.lang, {
      onText: (text) => {
        if (!isCurrent()) return;
        heardRef.current = text;
        setHeard(text);
      },
      onError: (message) => {
        if (isCurrent()) setVoiceError(message);
      },
      onEnd: () => {
        if (!isCurrent()) return;
        listenRef.current = null;
        const question = heardRef.current.trim();
        setHeard("");
        if (question && settingsRef.current.autoSend) {
          void ask(question, "voice");
          return;
        }
        if (question) {
          setDraft(question.slice(0, MAX_QUESTION));
          inputRef.current?.focus();
        }
        dispatch({ type: "MIC_STOP" });
      },
    });
    if (!session) {
      listenRef.current = null;
      return;
    }
    listenRef.current = { session, token };
    dispatch({ type: "MIC_START" });
  }

  function toggleSpeakReplies() {
    if (settings.speakReplies && state === "speaking") {
      stopSpeaking();
      dispatch({ type: "SPEECH_END" });
    }
    setSettings((current) => ({ ...current, speakReplies: !current.speakReplies }));
  }

  function clearChat() {
    stopSpeaking();
    if (state === "speaking") dispatch({ type: "SPEECH_END" });
    setMessages([]);
    setNotice(null);
  }

  // Maya stops talking when the learner leaves her tab. While she is listening or waiting for an
  // answer the tabs stay put, so a reply never lands unseen.
  const tabsLocked = state === "listening" || state === "thinking";
  function selectTab(next: "maya" | "missions") {
    if (next === tab || tabsLocked) return;
    stopSpeaking();
    if (state === "speaking") dispatch({ type: "SPEECH_END" });
    setTab(next);
    document.getElementById(`${tabsId}-${next}-tab`)?.focus();
  }

  const status = {
    idle: canListen ? "Ask with the mic and Maya talks back, or type and she replies in text." : "Type your question below.",
    listening: heard || "Listening. Speak now, then pause.",
    thinking: "Thinking…",
    speaking: "Speaking. Press the mic to interrupt.",
  }[state];

  return (
    <section
      ref={sectionRef}
      aria-label="Practice Session with Maya"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#eceef1] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Practice with Maya</h2>
          <p className="text-[11px] text-[#5c6371]">Workplace communication mentor</p>
        </div>
        <div className="flex items-center gap-1">
          {canSpeak && (
            <IconButton
              label={settings.speakReplies ? "Mute Maya's voice" : "Turn Maya's voice on"}
              pressed={!settings.speakReplies}
              onClick={toggleSpeakReplies}
            >
              {settings.speakReplies ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            </IconButton>
          )}
          {messages.length > 0 && (
            <IconButton label="Clear chat" onClick={clearChat}>
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          )}
          {onClose && (
            <IconButton label="Close Practice Session" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Practice mode"
        className="flex gap-1 border-b border-[#eceef1] px-3 pt-1.5"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          selectTab(tab === "maya" ? "missions" : "maya");
        }}
      >
        {(["maya", "missions"] as const).map((id) => (
          <button
            key={id}
            id={`${tabsId}-${id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`${tabsId}-${id}-panel`}
            aria-disabled={tab !== id && tabsLocked}
            tabIndex={tab === id ? 0 : -1}
            title={tab !== id && tabsLocked ? "Wait for Maya's answer first" : undefined}
            onClick={() => selectTab(id)}
            // The underline is an inset shadow: globals.css sets every border colour, which beats border-* classes.
            className={`cursor-pointer px-2.5 pb-2 pt-1.5 text-[12px] font-semibold transition aria-disabled:cursor-not-allowed aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${
              tab === id ? "text-[#12151c] shadow-[inset_0_-2px_0_#12151c]" : "text-[#5c6371] hover:text-[#12151c]"
            }`}
          >
            {id === "maya" ? "Ask Maya" : "Missions"}
          </button>
        ))}
      </div>

      <div
        id={`${tabsId}-maya-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-maya-tab`}
        hidden={tab !== "maya"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center gap-4 border-b border-[#eceef1] bg-[#f7f8fa] px-4 py-3">
          <MayaAvatar state={state} size={88} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[#5c6371]">
              {state === "idle" ? "Ready" : state === "listening" ? "Listening" : state === "thinking" ? "Thinking" : "Speaking"}
            </p>
            <p className={`mt-0.5 text-[13px] leading-snug ${state === "listening" && heard ? "italic text-[#12151c]" : "text-[#3b414c]"}`}>
              {status}
            </p>
          </div>
        </div>

        <CompanionBar id="maya" first="Maya" disabled={tabsLocked} onSay={(text) => void ask(text, "text")} />

        <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
          <Bubble role="mentor" text={GREETING} />
          {messages.length === 0 && (
            <div className="flex flex-col items-start gap-1.5 pt-1">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    inputRef.current?.focus(); // this button disappears, so keep focus in the panel
                    void ask(suggestion, "text");
                  }}
                  className="cursor-pointer rounded-xl border border-[#e6e7ea] bg-white px-3 py-1.5 text-left text-[12px] text-[#3b414c] transition hover:border-[#12151c]/30 hover:text-[#12151c] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {messages.map((message) => {
            const playing = speakingId === message.id;
            return (
              <div key={message.id} className="flex flex-col gap-1.5">
                <Bubble
                  role={message.role}
                  text={message.text}
                  source={message.source}
                  playing={playing}
                  listenDisabled={state === "listening" || state === "thinking"}
                  onListen={canSpeak && message.role === "mentor"
                    ? () => (playing ? stopReading() : readAloud(message.id, message.text))
                    : undefined}
                />
                {message.language && (
                  <LanguageCard
                    feedback={message.language}
                    onTryAgain={() => {
                      setDraft(message.text.slice(0, MAX_QUESTION));
                      inputRef.current?.focus();
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {(notice || voiceError) && (
          <div className="space-y-1 border-t border-[#eceef1] bg-[#fbf7ec] px-4 py-2 text-[11px] leading-4 text-[#5f4b12]">
            {voiceError && <p role="alert">{voiceError}</p>}
            {notice && <p role="status">{notice}</p>}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft, "text");
          }}
          className="flex items-center gap-2 border-t border-[#eceef1] bg-white p-2.5"
        >
          {canListen && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={state === "thinking"}
              aria-label={state === "listening" ? "Stop listening" : "Ask Maya by voice"}
              aria-pressed={state === "listening"}
              className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] ${
                state === "listening" ? "bg-[#b8325e] text-white" : "bg-[#f1f3f6] text-[#12151c] hover:bg-[#e6e8ec]"
              }`}
            >
              {state === "listening" ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
            </button>
          )}
          <label htmlFor={inputId} className="sr-only">
            Your question for Maya
          </label>
          <input
            id={inputId}
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask Maya a question…"
            maxLength={MAX_QUESTION}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2 text-[13px] text-[#12151c] outline-none transition placeholder:text-[#6b7280] focus:border-[#12151c]/30 focus:bg-white"
          />
          <button
            type="submit"
            disabled={!draft.trim() || state === "thinking"}
            aria-label="Send question"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-[#12151c] text-white transition hover:bg-black active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#6b7280]"
          >
            <ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </form>
      </div>

      <div
        id={`${tabsId}-missions-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-missions-tab`}
        hidden={tab !== "missions"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <MissionsTab />
      </div>

    </section>
  );
}

function Bubble({
  role,
  text,
  source,
  playing,
  listenDisabled,
  onListen,
}: {
  role: "user" | "mentor";
  text: string;
  source?: MentorSource;
  playing?: boolean;
  listenDisabled?: boolean;
  onListen?: () => void;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex w-full flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[88%] break-words px-3 py-2 text-[13px] leading-snug ${
          isUser ? "rounded-2xl rounded-br-md bg-[#12151c] text-white" : "rounded-2xl rounded-bl-md bg-[#f1f3f6] text-[#12151c]"
        }`}
      >
        {!isUser && <span className="sr-only">Maya: </span>}
        {text}
      </div>
      {(source || onListen) && (
        <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] text-[#6b7280]">
          {source && <span>{SOURCE_LABEL[source]}</span>}
          {onListen && (
            <button
              type="button"
              onClick={onListen}
              disabled={listenDisabled && !playing}
              aria-label={playing ? "Stop reading this reply" : "Listen to this reply"}
              className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-[#5c6371] transition hover:bg-[#f1f3f6] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playing ? <Square size={10} aria-hidden="true" /> : <Volume2 size={11} aria-hidden="true" />}
              {playing ? "Stop" : "Listen"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Maya's check of the learner's own English: hints first, the corrected words only on request,
// so the learner gets a chance to fix the sentence themselves ("Try again").
function LanguageCard({ feedback, onTryAgain }: { feedback: LanguageFeedback; onTryAgain: () => void }) {
  const { issues, tip, askedForAnswer } = feedback;
  // Nothing to fix and no tip: show nothing rather than a "no mistakes" line.
  if (!issues.length && !tip) return null;
  return (
    <section aria-label="Language check" className="flex w-full justify-end">
      <div
        className={`w-[88%] break-words rounded-xl border px-3 py-2 text-[12px] leading-snug ${
          issues.length ? "border-[#efe3c2] bg-[#fffbf1]" : "border-[#d8eadc] bg-[#f4faf5]"
        }`}
      >
        {issues.length > 0 && (
          <>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7a5d0e]">
              <SpellCheck size={12} aria-hidden="true" />
              Language check · {issues.length} to fix
            </p>
            <ul className="mt-1.5 space-y-2">
              {issues.map((issue) => (
                <IssueRow key={issue.quote} issue={issue} startOpen={askedForAnswer} />
              ))}
            </ul>
          </>
        )}
        {tip && (
          <p className={`flex gap-1.5 text-[#3b414c] ${issues.length ? "mt-2 border-t border-[#efe3c2] pt-2" : ""}`}>
            <Lightbulb size={13} className="mt-px shrink-0 text-[#7a5d0e]" aria-hidden="true" />
            <span>
              <span className="font-semibold text-[#12151c]">Tip: </span>
              {tip}
            </span>
          </p>
        )}
        {issues.length > 0 && !askedForAnswer && (
          <button
            type="button"
            onClick={onTryAgain}
            title="Puts your message back in the box so you can fix it"
            className="-ml-1.5 mt-2 flex min-h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#12151c] transition hover:bg-[#f6eed8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
          >
            <RotateCcw size={11} aria-hidden="true" />
            Try again
          </button>
        )}
      </div>
    </section>
  );
}

function IssueRow({ issue, startOpen }: { issue: LanguageIssue; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <li>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[#12151c] underline decoration-[#d9a514] decoration-wavy decoration-1 underline-offset-[3px]">
          “{issue.quote}”
        </span>
        <span className="text-[10px] text-[#7a5d0e]">{issue.kind}</span>
      </p>
      <p className="mt-0.5 text-[#3b414c]">{issue.hint}</p>
      {open && (
        <p className="mt-1 text-[#1f6b3a]">
          <span className="font-semibold">Fix: </span>
          {issue.fix}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`${open ? "Hide fix" : "Show fix"} for “${issue.quote}”`}
        className="-ml-1 mt-0.5 min-h-6 cursor-pointer rounded-md px-1 py-0.5 text-[11px] font-semibold text-[#5c6371] underline underline-offset-2 transition hover:bg-[#f6eed8] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
      >
        {open ? "Hide fix" : "Show fix"}
      </button>
    </li>
  );
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
    >
      {children}
    </button>
  );
}
