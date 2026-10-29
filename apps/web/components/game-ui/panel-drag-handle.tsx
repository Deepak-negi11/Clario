"use client";

import { useId, type KeyboardEvent } from "react";

// For the header of a panel that moves (see useDraggablePanel): it is the drag area, so it shows the
// grab cursor and doesn't scroll or select text under a finger. It must also be `relative`, for the handle.
export const draggableHeader = "group/drag relative cursor-grab touch-none select-none data-dragging:cursor-grabbing";

// The grip at the top of a moving panel. The whole header drags; this is what you see, and what
// keyboard users focus to move the panel with the arrow keys.
export function PanelDragHandle({ label, onKeyDown }: { label: string; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void }) {
  const hintId = useId();
  return (
    <>
      <button
        type="button"
        data-drag-handle
        aria-label={label}
        aria-describedby={hintId}
        title="Drag to move. Double-click to put it back."
        onKeyDown={onKeyDown}
        className="absolute left-1/2 top-0 grid h-3.5 w-12 -translate-x-1/2 cursor-grab place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
      >
        <span
          aria-hidden="true"
          className="h-1 w-8 rounded-full bg-[#d5d8de] transition-colors group-hover/drag:bg-[#a3a8b2] motion-reduce:transition-none"
        />
      </button>
      <span id={hintId} hidden>
        Arrow keys move it, Shift with an arrow moves it further, and Home puts it back.
      </span>
    </>
  );
}
