"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { MentorState } from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import { PracticeSession } from "./practice-session";

// Opens the Practice Session when the player talks to Maya on the map, pauses the game
// keyboard while it is open, and tells the scene what Maya is doing.
export function MentorOnMap({ bridgeRef }: { bridgeRef: RefObject<SceneBridge> }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge.openMentor = () => setOpen(true);
    return () => {
      bridge.openMentor = undefined;
    };
  }, [bridgeRef]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge.setKeyboardEnabled?.(!open);
    if (!open) bridge.mentorState = undefined; // panel closed: her tag goes back to "Press E"
  }, [open, bridgeRef]);

  const showState = useCallback(
    (state: MentorState) => {
      bridgeRef.current.mentorState = state;
    },
    [bridgeRef],
  );
  const close = useCallback(() => setOpen(false), []);

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 top-3 z-[66] w-[min(23rem,calc(100vw-6rem))]">
      <PracticeSession onClose={close} onStateChange={showState} />
    </div>
  );
}
