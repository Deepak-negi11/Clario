"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// A native modal <dialog> for the arcade and the TV. showModal() puts it in the top layer above
// the map, makes the page behind it inert and traps focus; Escape fires "cancel", which we turn
// into onDismiss so the parent unmounts it. Keys are stopped here so the Phaser scene (which
// listens on window) never sees them. Focus goes back to where it was when it closes.
export function OverlayDialog({
  labelledBy,
  onDismiss,
  className = "",
  children,
}: {
  labelledBy: string;
  onDismiss: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const unmountingRef = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    unmountingRef.current = false;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      unmountingRef.current = true; // our own close() below must not dismiss whatever opens next
      if (dialog.open) dialog.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      // The browser can still close it (for example after repeated Escape presses).
      // (A late close event from a dev Strict Mode remount finds the dialog open again: ignore it.)
      onClose={() => {
        if (!unmountingRef.current && !ref.current?.open) onDismiss();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      className={`m-auto max-h-[calc(100dvh-1rem)] max-w-none overflow-y-auto overscroll-contain border-0 [color-scheme:dark] bg-transparent p-0 text-inherit opacity-100 transition-[opacity,scale] duration-150 ease-out backdrop:bg-[#0b0d14]/70 backdrop:backdrop-blur-[2px] starting:scale-[0.98] starting:opacity-0 motion-reduce:transition-none ${className}`}
    >
      {children}
    </dialog>
  );
}
