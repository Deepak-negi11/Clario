"use client";

import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Briefcase, CheckCircle2, Mic, Square, Trash2, Volume2, VolumeX, X } from "lucide-react";
import {
  COWORKER_HISTORY_LIMIT,
  MAX_COWORKER_MESSAGE,
  MISSIONS,
  coworkerChatResponse,
  coworkerMission,
  firstName,
  getCoworker,
  nextMentorState,
  savedCoworkerReply,
  type Coworker,
  type CoworkerAction,
  type CoworkerChatResponse,
  type CoworkerId,
  type MentorState,
} from "@repo/shared";
import { isSpeechRecognitionSupported, listen, type ListenSession } from "../../lib/speech/recognition";
import { isSpeechSynthesisSupported, speak, warmUpVoices } from "../../lib/speech/synthesis";
import { readRuns, readShowXp } from "../../lib/missions/progress";
import { answerCompanion, useCompanions } from "../../lib/companions/store";
import { CompanionBar } from "../companions/companion-bar";
import { MissionChat } from "../missions/mission-chat";

// Talk to an AI coworker (Arjun, Priya, Rahul) at their desk, by typing or talking; they answer
// in character, out loud when you talk. When they ask for help with their task, the reply gets a
// button that opens their Workplace Quest mission right here (missions/mission-chat.tsx).
// Same flow as Maya's panel (practice-session.tsx). Render it only in the browser: it reads
// storage and speech support when it mounts.

type ChatItem = { id: string; role: "user" | "coworker"; text: string; source?: CoworkerChatResponse["source"]; action?: CoworkerAction };
type Settings = { speakReplies: boolean };

const SETTINGS_KEY = "coworkers:settings";
const historyKey = (id: CoworkerId) => `coworkers:${id}:history`;
const MAX_STORED = 40;
const GREETING_ID = "greeting";
// The learner's speech. Each coworker answers in their own voice (coworkers.ts).
const LISTEN_LANG = "en-IN";
const SUGGESTIONS = ["Hi! I just joined the team.", "What are you working on?", "Anything I can help with?"];

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
    // Private mode or full storage: the chat still works, it just isn't remembered.
  }
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

type CoworkerPanelProps = {
  coworkerId: CoworkerId;
  onClose?: () => void;
  onStateChange?: (state: MentorState) => void;
};

export function CoworkerPanel({ coworkerId, onClose, onStateChange }: CoworkerPanelProps) {
  const coworker = getCoworker(coworkerId)!;
  const mission = coworkerMission(coworker);
  const { name, role } = mission.coworker;
  const first = firstName(name);

  const [settings, setSettings] = useState<Settings>(() => ({
    speakReplies: true,
    ...readStored<Partial<Settings>>(localStorage, SETTINGS_KEY, {}),
  }));
  // Kept for this tab only: free-form chat is where real details are most likely to be typed.
  const [messages, setMessages] = useState<ChatItem[]>(() => readStored<ChatItem[]>(sessionStorage, historyKey(coworkerId), []));
  const [state, dispatch] = useReducer(nextMentorState, "idle");
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [canListen] = useState(isSpeechRecognitionSupported);
  const [canSpeak] = useState(isSpeechSynthesisSupported);
  // "mission": their Workplace Quest mission, opened from an offer in the chat.
  const [view, setView] = useState<"chat" | "mission">("chat");
  const [missionDone, setMissionDone] = useState(() => !!readRuns()[mission.id]?.completed);
  const [showXp] = useState(readShowXp);

  const inputId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const listenRef = useRef<{ session: ListenSession | null; token: object } | null>(null);
  const heardRef = useRef("");
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  // The line being read aloud right now, so its bubble can show "Stop".
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
    writeStored(sessionStorage, historyKey(coworkerId), messages.slice(-MAX_STORED));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, coworkerId]);

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
    cancelSpeechRef.current = speak(text, coworker.voice, () => {
      cancelSpeechRef.current = null;
      setSpeakingId(null);
      dispatch({ type: "SPEECH_END" });
    });
  }, [coworker]);

  // Walking up to them: they say hello out loud the first time (voice on, nothing said yet this tab).
  useEffect(() => {
    if (messagesRef.current.length > 0 || !settingsRef.current.speakReplies || !isSpeechSynthesisSupported()) return;
    dispatch({ type: "READ_ALOUD" });
    startSpeech(GREETING_ID, coworker.greeting);
  }, [coworker, startSpeech]);

  // A spoken message gets a spoken reply (unless their voice is muted); a typed one gets text
  // only, with a Listen button on the reply.
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

  const send = useCallback(async (raw: string, mode: "text" | "voice") => {
    const message = raw.trim().slice(0, MAX_COWORKER_MESSAGE);
    if (!message || requestRef.current) return;

    stopListening();
    stopSpeaking();
    dispatch({ type: mode === "voice" ? "HEARD" : "SEND_TEXT" });
    setDraft("");
    setHeard("");
    setVoiceError(null);

    // Asking them to walk or play with you in the 3D view, or to stop, is done here, not by the AI.
    const agreed = answerCompanion(coworker.id, message);
    if (agreed) {
      const agreedId = newId();
      setNotice(null);
      setMessages((previous) => [...previous, { id: newId(), role: "user", text: message }, { id: agreedId, role: "coworker", text: agreed }]);
      say(agreedId, agreed, mode === "voice");
      return;
    }

    // Their greeting goes first, so a reply to it ("yes, I was there") makes sense to the AI.
    const history = [{ role: "coworker" as const, text: coworker.greeting }, ...messagesRef.current]
      .slice(-COWORKER_HISTORY_LIMIT)
      .map(({ role, text }) => ({ role, text }));
    setMessages((previous) => [...previous, { id: newId(), role: "user", text: message }]);

    const controller = new AbortController();
    requestRef.current = controller;
    let answer: CoworkerChatResponse;
    try {
      const response = await fetch("/api/coworkers/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coworkerId: coworker.id, message, history }),
        signal: controller.signal,
      });
      const body = (await response.json()) as CoworkerChatResponse & { error?: string };
      if (!response.ok) {
        setNotice(body.error ?? `${first} couldn't read that. Try again.`);
        dispatch({ type: "REPLY", speak: false });
        return;
      }
      answer = body;
    } catch {
      if (controller.signal.aborted) return; // the panel was closed
      answer = coworkerChatResponse(
        coworker,
        savedCoworkerReply(coworker, message),
        "saved",
        `Can't reach the server right now, so ${first} answers with a saved line.`,
      );
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }

    setNotice(answer.notice ?? null);
    const replyId = newId();
    setMessages((previous) => [...previous, { id: replyId, role: "coworker", text: answer.reply, source: answer.source, action: answer.action }]);
    say(replyId, answer.reply, mode === "voice");
  }, [coworker, first, say, stopListening, stopSpeaking]);

  function toggleMic() {
    if (state === "listening") {
      listenRef.current?.session?.stop(); // finishes the turn with what was heard so far
      return;
    }
    if (state === "thinking") return;

    stopSpeaking(); // talking over them interrupts
    setVoiceError(null);
    setHeard("");
    heardRef.current = "";

    const token = {};
    listenRef.current = { session: null, token };
    const isCurrent = () => listenRef.current?.token === token;
    const session = listen(LISTEN_LANG, {
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
        const message = heardRef.current.trim();
        setHeard("");
        if (message) {
          void send(message, "voice");
          return;
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

  // While they listen or think the chat stays put, so a reply never lands unseen.
  const busy = state === "listening" || state === "thinking";
  // Walking or playing with you in the 3D view.
  const withYou = !!useCompanions().modes[coworker.id];

  function openMission() {
    if (busy) return;
    stopSpeaking();
    if (state === "speaking") dispatch({ type: "SPEECH_END" });
    setView("mission");
  }

  // The button that was clicked disappears, so move focus somewhere sensible.
  useEffect(() => {
    if (view === "mission") backRef.current?.focus();
    else inputRef.current?.focus();
  }, [view]);

  // Only an offer of their own mission becomes a button; anything else in a reply is ignored.
  const offersMission = (action?: CoworkerAction) => action?.type === "open-mission" && action.missionId === mission.id;
  const missionNumber = MISSIONS.findIndex((item) => item.id === mission.id) + 1;

  const status = {
    idle: canListen ? `Talk with the mic and ${first} answers out loud, or type and get a text reply.` : "Type a message below.",
    listening: heard || "Listening. Speak now, then pause.",
    thinking: `${first} is typing…`,
    speaking: "Speaking. Press the mic to interrupt.",
  }[state];

  return (
    <section
      ref={sectionRef}
      aria-label={`Chat with ${name}`}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#eceef1] px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          <p className="truncate text-[11px] text-[#5c6371]">{role} · Larkspur Labs</p>
        </div>
        <div className="flex items-center gap-1">
          {canSpeak && (
            <IconButton
              label={settings.speakReplies ? `Mute ${first}'s voice` : `Turn ${first}'s voice on`}
              pressed={!settings.speakReplies}
              onClick={toggleSpeakReplies}
            >
              {settings.speakReplies ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            </IconButton>
          )}
          {messages.length > 0 && view === "chat" && (
            <IconButton label="Clear chat" onClick={clearChat}>
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          )}
          {onClose && (
            <IconButton label={`Close chat with ${first}`} onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </header>

      {view === "mission" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <button
            ref={backRef}
            type="button"
            onClick={() => setView("chat")}
            className="flex cursor-pointer items-center gap-1 border-b border-[#eceef1] px-4 py-2 text-left text-[12px] font-semibold text-[#5c6371] transition hover:bg-[#f7f8fa] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#12151c]"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            Back to chat with {first}
          </button>
          <div className="min-h-0 flex-1">
            <MissionChat
              mission={mission}
              number={missionNumber}
              showXp={showXp}
              embedded
              onRunChange={(run) => setMissionDone(run.completed)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 border-b border-[#eceef1] bg-[#f7f8fa] px-4 py-3">
            <CoworkerBadge name={name} color={coworker.color} state={state} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-[#5c6371]">
                {state === "idle" ? (withYou ? "With you" : "At their desk") : state === "listening" ? "Listening" : state === "thinking" ? "Typing" : "Speaking"}
              </p>
              <p className={`mt-0.5 text-[13px] leading-snug ${state === "listening" && heard ? "italic text-[#12151c]" : "text-[#3b414c]"}`}>
                {status}
              </p>
            </div>
          </div>

          <CompanionBar id={coworker.id} first={first} disabled={busy} onSay={(text) => void send(text, "text")} />

          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-3" aria-live="polite">
            <Bubble
              coworker={coworker}
              first={first}
              role="coworker"
              text={coworker.greeting}
              playing={speakingId === GREETING_ID}
              listenDisabled={busy}
              onListen={canSpeak ? () => (speakingId === GREETING_ID ? stopReading() : readAloud(GREETING_ID, coworker.greeting)) : undefined}
            />
            {messages.length === 0 && (
              <div className="flex flex-col items-start gap-1.5 pt-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      inputRef.current?.focus(); // this button disappears, so keep focus in the panel
                      void send(suggestion, "text");
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
                    coworker={coworker}
                    first={first}
                    role={message.role}
                    text={message.text}
                    source={message.source}
                    playing={playing}
                    listenDisabled={busy}
                    onListen={canSpeak && message.role === "coworker"
                      ? () => (playing ? stopReading() : readAloud(message.id, message.text))
                      : undefined}
                  />
                  {offersMission(message.action) && (
                    <button
                      type="button"
                      onClick={openMission}
                      disabled={busy}
                      className="flex max-w-[88%] cursor-pointer items-center gap-2 self-start rounded-xl border border-[#12151c]/15 bg-white px-3 py-2 text-left text-[12px] font-semibold text-[#12151c] shadow-[0_1px_0_rgba(18,21,28,0.04)] transition hover:border-[#12151c]/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#12151c]"
                    >
                      {missionDone
                        ? <CheckCircle2 size={14} className="shrink-0 text-[#17663d]" aria-hidden="true" />
                        : <Briefcase size={14} className="shrink-0" style={{ color: coworker.color }} aria-hidden="true" />}
                      <span>
                        {missionDone ? "Practise again" : "Help with this"}: {mission.title}
                        <span className="block text-[10px] font-normal text-[#6b7280]">Mission {missionNumber} · a coach checks your reply</span>
                      </span>
                    </button>
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
              void send(draft, "text");
            }}
            className="flex items-center gap-2 border-t border-[#eceef1] bg-white p-2.5"
          >
            {canListen && (
              <button
                type="button"
                onClick={toggleMic}
                disabled={state === "thinking"}
                aria-label={state === "listening" ? "Stop listening" : `Talk to ${first}`}
                aria-pressed={state === "listening"}
                className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] ${
                  state === "listening" ? "bg-[#b8325e] text-white" : "bg-[#f1f3f6] text-[#12151c] hover:bg-[#e6e8ec]"
                }`}
              >
                {state === "listening" ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              </button>
            )}
            <label htmlFor={inputId} className="sr-only">
              Your message to {first}
            </label>
            <input
              id={inputId}
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Message ${first}…`}
              maxLength={MAX_COWORKER_MESSAGE}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2 text-[13px] text-[#12151c] outline-none transition placeholder:text-[#6b7280] focus:border-[#12151c]/30 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!draft.trim() || state === "thinking"}
              aria-label="Send message"
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-[#12151c] text-white transition hover:bg-black active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#6b7280] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]"
            >
              <ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </form>
        </>
      )}
    </section>
  );
}

// Their initials in their colour; a ring while they listen, dots while they type, bars while they talk.
function CoworkerBadge({ name, color, state }: { name: string; color: string; state: MentorState }) {
  const initials = name.split(" ").map((part) => part[0] ?? "").join("").slice(0, 2);
  return (
    <div className="relative h-16 w-16 shrink-0" aria-hidden="true">
      {state === "listening" && <span className="absolute inset-0 rounded-full bg-[#b8325e]/25 motion-safe:animate-ping" />}
      <span
        className="relative grid h-full w-full place-items-center rounded-full text-[21px] font-semibold tracking-wide text-white ring-4 ring-white"
        style={{ backgroundColor: color }}
      >
        {initials}
      </span>
      {(state === "thinking" || state === "speaking") && (
        <span className="absolute -bottom-1 -right-1 flex h-6 items-center gap-[3px] rounded-full bg-white px-1.5 shadow-[0_2px_6px_rgba(18,21,28,0.18)]">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={state === "thinking" ? "h-1.5 w-1.5 rounded-full motion-safe:animate-bounce" : "h-3 w-[3px] rounded-full motion-safe:animate-pulse"}
              style={{ backgroundColor: color, animationDelay: `${index * 150}ms` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

function Bubble({
  coworker,
  first,
  role,
  text,
  source,
  playing,
  listenDisabled,
  onListen,
}: {
  coworker: Coworker;
  first: string;
  role: "user" | "coworker";
  text: string;
  source?: CoworkerChatResponse["source"];
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
        style={isUser ? undefined : { boxShadow: `inset 3px 0 0 ${coworker.color}` }}
      >
        {!isUser && <span className="sr-only">{first}: </span>}
        {text}
      </div>
      {(source === "saved" || onListen) && (
        <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] text-[#6b7280]">
          {source === "saved" && <span>Saved line</span>}
          {onListen && (
            <button
              type="button"
              onClick={onListen}
              disabled={listenDisabled && !playing}
              aria-label={playing ? "Stop reading this message" : "Listen to this message"}
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
