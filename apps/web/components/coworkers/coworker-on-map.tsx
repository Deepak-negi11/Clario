"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getCoworker, type CoworkerId, type MentorState } from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import { CoworkerPanel } from "./coworker-panel";

// Opens the talk panel when the player walks up to an AI coworker and talks to them, pauses the
// game keyboard while it is open, and tells the scene what that coworker is doing.
export function CoworkerOnMap({ bridgeRef }: { bridgeRef: RefObject<SceneBridge> }) {
  const [openId, setOpenId] = useState<CoworkerId | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge.openCoworker = (id) => {
      if (getCoworker(id)) setOpenId(id);
    };
    return () => {
      bridge.openCoworker = undefined;
    };
  }, [bridgeRef]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!openId) bridge.coworkerState = undefined; // panel closed: their tag goes back to "Press E"
    // Only on open and close, so mounting this doesn't override Maya's panel.
    if (!!openId === wasOpenRef.current) return;
    wasOpenRef.current = !!openId;
    bridge.setKeyboardEnabled?.(!openId);
  }, [openId, bridgeRef]);

  const showState = useCallback(
    (state: MentorState) => {
      if (openId) bridgeRef.current.coworkerState = { id: openId, state };
    },
    [bridgeRef, openId],
  );
  const close = useCallback(() => setOpenId(null), []);

  if (!openId) return null;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 top-3 z-[66] w-[min(23rem,calc(100vw-6rem))]">
      <CoworkerPanel key={openId} coworkerId={openId} onClose={close} onStateChange={showState} />
    </div>
  );
}
