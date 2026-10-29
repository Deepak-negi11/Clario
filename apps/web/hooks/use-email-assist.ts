"use client";

// AI writing help for the email composer (POST /api/email-assist). While the writer types a subject
// it asks for a suggested message; while they type the message it asks which words are too casual.
// Each request waits for a pause in typing, and the one in flight is cancelled when the text changes.
// Any failure just means no AI help: the composer works the same without it.

import { useEffect, useRef, useState } from "react";
import type { EmailAssistRequest, EmailAssistResponse, ToneFlag } from "@repo/shared";
import { getAuthToken } from "../lib/auth-token";

const SUGGEST_DELAY_MS = 700;
const CHECK_DELAY_MS = 1200;
const MIN_SUBJECT_CHARS = 4;
const MIN_CHECK_WORDS = 3;
// After "too many requests", wait this long before asking again.
const BACK_OFF_MS = 60_000;
// The route gives up on the AI after 8 s; this covers a request that never reaches it.
const REQUEST_TIMEOUT_MS = 12_000;

type AssistInput = {
  active: boolean;        // the composer is open on the subject or message step
  checkMessage: boolean;  // the message step is showing, so its wording is worth checking
  recipientName: string;
  subject: string;
  body: string;
};

export type EmailAssist = {
  suggestion: string | null;  // a message for the current recipient and subject, once ready
  suggesting: boolean;
  subjectFlags: ToneFlag[];   // the AI's flags on the subject, from the suggestion request
  bodyFlags: ToneFlag[];      // the AI's flags on the message, from the last check (may be stale)
};

// Off = no key on the server or not signed in, so asking again won't help.
type Outcome = { kind: "ok"; data: EmailAssistResponse } | { kind: "off" } | { kind: "busy" } | { kind: "failed" };

async function askAssist(request: EmailAssistRequest, signal: AbortSignal): Promise<Outcome> {
  const token = getAuthToken();
  if (!token) return { kind: "off" };
  try {
    const response = await fetch("/api/email-assist", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    if (response.status === 401 || response.status === 503) return { kind: "off" };
    if (response.status === 429) return { kind: "busy" };
    if (!response.ok) return { kind: "failed" };
    return { kind: "ok", data: (await response.json()) as EmailAssistResponse };
  } catch {
    return { kind: "failed" };
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function useEmailAssist({ active, checkMessage, recipientName, subject, body }: AssistInput): EmailAssist {
  const [off, setOff] = useState(false);
  // Suggestions by recipient + subject (null = none came back), so going back and forth doesn't ask again.
  const [suggestions, setSuggestions] = useState<Record<string, EmailAssistResponse | null>>({});
  const [checked, setChecked] = useState<{ text: string; flags: ToneFlag[] } | null>(null);
  const pausedUntil = useRef(0);

  const trimmedSubject = subject.trim();
  const subjectKey = active && !off && trimmedSubject.length >= MIN_SUBJECT_CHARS ? `${recipientName}\n${trimmedSubject}` : null;
  const known = subjectKey !== null && subjectKey in suggestions;
  const current = subjectKey ? suggestions[subjectKey] : undefined;
  const suggestion = current?.body ?? null;

  // The writer's own message is checked; a suggestion they just used as it is was written by the AI.
  const checkText = active && !off && checkMessage && wordCount(body) >= MIN_CHECK_WORDS && body !== suggestion ? body : null;

  useEffect(() => {
    if (subjectKey === null || known) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (Date.now() < pausedUntil.current) {
        setSuggestions((all) => ({ ...all, [subjectKey]: null }));
        return;
      }
      const outcome = await askAssist({ mode: "suggest", recipientName, subject: trimmedSubject, body: "" }, controller.signal);
      if (controller.signal.aborted) return;
      if (outcome.kind === "off") setOff(true);
      if (outcome.kind === "busy") pausedUntil.current = Date.now() + BACK_OFF_MS;
      setSuggestions((all) => ({ ...all, [subjectKey]: outcome.kind === "ok" ? outcome.data : null }));
    }, SUGGEST_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [subjectKey, known, recipientName, trimmedSubject]);

  useEffect(() => {
    if (checkText === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (Date.now() < pausedUntil.current) return;
      const outcome = await askAssist({ mode: "check", recipientName, subject: trimmedSubject, body: checkText }, controller.signal);
      if (controller.signal.aborted) return;
      if (outcome.kind === "off") setOff(true);
      if (outcome.kind === "busy") pausedUntil.current = Date.now() + BACK_OFF_MS;
      if (outcome.kind === "ok") setChecked({ text: checkText, flags: outcome.data.flags });
    }, CHECK_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [checkText, recipientName, trimmedSubject]);

  return {
    suggestion,
    suggesting: subjectKey !== null && !known,
    subjectFlags: current?.flags ?? [],
    bodyFlags: checked?.flags ?? [],
  };
}
