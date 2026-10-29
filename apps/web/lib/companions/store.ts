import { useSyncExternalStore } from "react";
import type { CoworkerId } from "@repo/shared";
import { companionReply, parseCompanionIntent } from "./intent";

// Who is walking or playing with you in the 3D view: Maya or an AI coworker you asked. It lives in
// this tab only, so other people in the space still see them where they stand. The 3D view opens
// it while it is showing (closing it sends everyone back), the talk panels ask, and the 3D view
// reads it every frame and moves them.

export type TalkerId = CoworkerId | "maya";
export type CompanionMode = "follow" | "play";
export type Companions = { open: boolean; modes: Partial<Record<TalkerId, CompanionMode>> };

const CLOSED: Companions = { open: false, modes: {} };
let current = CLOSED;
const listeners = new Set<() => void>();

function update(next: Companions) {
  current = next;
  for (const listener of listeners) listener();
}

export const companions = {
  get: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setOpen(open: boolean) {
    if (open !== current.open) update(open ? { open: true, modes: {} } : CLOSED);
  },
  // Asks them to walk or play with you, or (null) to stop. Nothing happens while the 3D view is closed.
  set(id: TalkerId, mode: CompanionMode | null) {
    if (!current.open || (current.modes[id] ?? null) === mode) return;
    const modes = { ...current.modes };
    if (mode) modes[id] = mode;
    else delete modes[id];
    update({ open: true, modes });
  },
};

export function useCompanions() {
  return useSyncExternalStore(companions.subscribe, companions.get, () => CLOSED);
}

// A chat message to them that asks them to walk, play or stop: does it and returns what they say
// back. Null for any other message (the AI answers it), with the 3D view closed, and for "stop" or
// "bye" when they aren't with you (a goodbye is just a goodbye then).
export function answerCompanion(id: TalkerId, text: string) {
  const intent = parseCompanionIntent(text);
  const { open, modes } = companions.get();
  const mode = modes[id] ?? null;
  if (!open || !intent || (intent === "stop" && !mode)) return null;
  companions.set(id, intent === "stop" ? null : intent);
  // Already playing, or already with you when asked to walk (a game is a walk with you too).
  return companionReply(intent, intent === "play" ? mode === "play" : !!mode);
}
