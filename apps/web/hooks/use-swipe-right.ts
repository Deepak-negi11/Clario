"use client";

import { useEffect, useRef } from "react";

// How far the fingers must travel (in wheel pixels) before the swipe counts.
const SWIPE_DISTANCE = 120;
// A pause this long ends one swipe, so the momentum after the fingers lift can't fire it twice.
const GESTURE_GAP_MS = 250;

// While `enabled`, a two-finger trackpad swipe from left to right calls `onSwipe` once per swipe.
// Browsers report the swipe as horizontal wheel events: with macOS natural scrolling (the default),
// fingers moving right give a negative deltaX. Those events are also cancelled so Chrome doesn't
// read the swipe as "go back" and take the user out of the space.
export function useSwipeRight(onSwipe: () => void, enabled = true) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  useEffect(() => {
    if (!enabled) return;

    let travel = 0;
    let fired = false;
    let lastEventAt = -Infinity;

    const onWheel = (event: WheelEvent) => {
      if (event.timeStamp - lastEventAt > GESTURE_GAP_MS) {
        travel = 0;
        fired = false;
      }
      lastEventAt = event.timeStamp;

      // Pinch-zoom arrives as ctrl+wheel; vertical scrolls and map zoom are not ours either.
      if (event.ctrlKey || event.deltaX >= 0 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if (ownsHorizontalScroll(event.target)) return;

      event.preventDefault();
      travel -= event.deltaX;
      if (!fired && travel >= SWIPE_DISTANCE) {
        fired = true;
        onSwipeRef.current();
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [enabled]);
}

// True when the swipe lands on a text field or on something that scrolls sideways itself.
function ownsHorizontalScroll(target: EventTarget | null) {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (node.matches("input, textarea, select, [contenteditable='true']")) return true;
    if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
  }
  return false;
}
