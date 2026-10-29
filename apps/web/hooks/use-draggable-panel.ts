"use client";

import { useCallback, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

type Offset = { x: number; y: number };

const ZERO: Offset = { x: 0, y: 0 };
// Gap kept between a panel and the edges of the window.
const EDGE = 8;
// A press has to travel this far before it drags, so clicks and taps on the header stay clicks.
const DRAG_START = 4;
// Two taps on the header within this time put the panel back.
const DOUBLE_TAP_MS = 350;
// Arrow keys on the handle move the panel this far, or KEY_STEP_BIG with Shift held.
const KEY_STEP = 16;
const KEY_STEP_BIG = 64;
const ARROWS: Record<string, Offset> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
const RESET_TIMING: KeyframeAnimationOptions = { duration: 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

const storageKey = (id: string) => `clario:panel-position:${id}`;
const toTransform = ({ x, y }: Offset) => `translate(${x}px, ${y}px)`;

function readOffset(id: string): Offset {
  try {
    const { x, y } = JSON.parse(localStorage.getItem(storageKey(id)) ?? "{}") as Partial<Offset>;
    if (typeof x === "number" && typeof y === "number") return { x, y };
  } catch {
    // No storage (private mode) or a value we can't read: use the default spot.
  }
  return ZERO;
}

function saveOffset(id: string, offset: Offset) {
  try {
    if (offset.x === 0 && offset.y === 0) localStorage.removeItem(storageKey(id));
    else localStorage.setItem(storageKey(id), JSON.stringify(offset));
  } catch {
    // Storage can be unavailable (private mode); the panel still moves for this visit.
  }
}

// The panel's box at its default spot. Layout values only, so the email panel's slide-in doesn't count.
function homeBox(panel: HTMLElement) {
  const parent = panel.offsetParent?.getBoundingClientRect();
  return {
    left: (parent?.left ?? 0) + panel.offsetLeft,
    top: (parent?.top ?? 0) + panel.offsetTop,
    width: panel.offsetWidth,
    height: panel.offsetHeight,
  };
}

// The nearest offset that keeps the whole panel on screen. When it can't fit, the top-left corner
// wins, so the header (what you drag it by) stays in reach. Whole pixels keep the text sharp.
function keepOnScreen(panel: HTMLElement, offset: Offset): Offset {
  const home = homeBox(panel);
  const right = window.innerWidth - EDGE - home.width - home.left;
  const bottom = window.innerHeight - EDGE - home.height - home.top;
  return {
    x: Math.round(Math.max(EDGE - home.left, Math.min(offset.x, right))),
    y: Math.round(Math.max(EDGE - home.top, Math.min(offset.y, bottom))),
  };
}

// True when a press starts on one of the header's own controls (close, back), which keep their click.
function onOtherControl(target: EventTarget) {
  return target instanceof Element && !!target.closest("button:not([data-drag-handle]), a, input, select, textarea");
}

// Lets a floating panel be dragged by its header (mouse, touch or pen), or moved with the arrow keys
// from its handle. The move is an offset from the panel's default spot, applied as a transform, so the
// panel's own classes still place it. It is saved per panel id, so the panel reopens where it was left.
export function useDraggablePanel(id: string) {
  const panel = useRef<HTMLElement | null>(null);
  // Where the user put the panel. What's shown is that, kept on screen: a smaller window squeezes the
  // panel in, and a bigger one gives the spot back.
  const wantedRef = useRef<Offset>(ZERO);
  const shownRef = useRef<Offset>(ZERO);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; from: Offset; moved: boolean } | null>(null);
  const lastTapRef = useRef(-Infinity);

  const show = useCallback((offset: Offset) => {
    const element = panel.current;
    if (!element) return;
    const next = keepOnScreen(element, offset);
    shownRef.current = next;
    element.style.transform = next.x || next.y ? toTransform(next) : "";
  }, []);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      panel.current = element;
      wantedRef.current = readOffset(id);
      show(wantedRef.current);
      // Fit it again whenever the window or the panel's content changes size.
      const refit = () => show(wantedRef.current);
      const observer = new ResizeObserver(refit);
      observer.observe(element);
      window.addEventListener("resize", refit);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", refit);
        panel.current = null;
      };
    },
    [id, show],
  );

  // A move by the user becomes the new wanted spot.
  function moveTo(offset: Offset) {
    show(offset);
    wantedRef.current = shownRef.current;
  }

  function reset() {
    const from = shownRef.current;
    wantedRef.current = ZERO;
    show(ZERO);
    saveOffset(id, ZERO);
    // Glide back instead of jumping, unless the user asked for less motion.
    if (panel.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      panel.current.animate([{ transform: toTransform(from) }, { transform: toTransform(shownRef.current) }], RESET_TIMING);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || onOtherControl(event.target)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, from: shownRef.current, moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return;
    drag.moved = true;
    event.currentTarget.dataset.dragging = "";
    moveTo({ x: drag.from.x + dx, y: drag.from.y + dy });
  }

  // Runs on pointerup, pointercancel and lostpointercapture; only the first one for a press does anything.
  function endDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    delete event.currentTarget.dataset.dragging;
    if (drag.moved) {
      saveOffset(id, wantedRef.current);
    } else if (event.type === "pointerup") {
      // A tap. Two in a row (a double-click, or a double-tap on touch) put the panel back.
      if (event.timeStamp - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = -Infinity;
        reset();
      } else {
        lastTapRef.current = event.timeStamp;
      }
    }
  }

  // Pressing the header doesn't take focus from the field being typed in, or select the title text.
  function onMouseDown(event: MouseEvent<HTMLElement>) {
    if (!onOtherControl(event.target)) event.preventDefault();
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const arrow = ARROWS[event.key];
    if (event.key === "Home") {
      reset();
    } else if (arrow) {
      const step = event.shiftKey ? KEY_STEP_BIG : KEY_STEP;
      moveTo({ x: shownRef.current.x + arrow.x * step, y: shownRef.current.y + arrow.y * step });
      saveOffset(id, wantedRef.current);
    } else {
      return;
    }
    event.preventDefault();
    // The 2D map walks the player on arrow keys pressed anywhere on the page.
    event.stopPropagation();
  }

  return {
    /** Callback ref for the panel's root element. */
    ref,
    /** The panel element, for callers that need it too. */
    panel,
    /** Spread on the header: it becomes the drag area. */
    headerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onMouseDown,
    },
    /** Spread on the focusable handle (PanelDragHandle). */
    handleProps: { onKeyDown: onHandleKeyDown },
  };
}
