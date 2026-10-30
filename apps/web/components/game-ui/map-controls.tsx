"use client";

import type { RefObject } from "react";
import { Box, Maximize, Minus, Plus } from "lucide-react";
import type { SceneBridge } from "../phaser/scene-bridge";

// Buttons floating over the map, in the same surface as the left rail: on maps with a 3D view, the
// one that opens it, then zoom. The 3D view covers them and has its own way back.
export function MapControls({ bridgeRef, onOpen3d }: { bridgeRef: RefObject<SceneBridge>; onOpen3d?: () => void }) {
  return (
    <div
      role="group"
      aria-label="Map controls"
      className="pointer-events-auto absolute bottom-20 right-4 z-40 flex flex-col items-center gap-0.5 rounded-2xl bg-[#1b1d2a]/20 p-1 ring-1 ring-white/30 backdrop-blur-[3px] md:bottom-4"
    >
      {onOpen3d && (
        <>
          <button
            type="button"
            onClick={onOpen3d}
            title="See the office in 3D"
            className="flex h-12 w-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-white transition [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))] hover:bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white active:scale-95 motion-reduce:transition-none"
          >
            <Box size={18} aria-hidden="true" />
            3D map
          </button>
          <div className="my-0.5 h-px w-7 shrink-0 bg-white/60 shadow-[0_1px_1px_rgba(0,0,0,0.35)]" aria-hidden="true" />
        </>
      )}
      <ZoomButton label="Zoom in" onClick={() => bridgeRef.current?.zoomBy?.(1.25)}>
        <Plus size={17} aria-hidden="true" />
      </ZoomButton>
      <ZoomButton label="Zoom out" onClick={() => bridgeRef.current?.zoomBy?.(0.8)}>
        <Minus size={17} aria-hidden="true" />
      </ZoomButton>
      <ZoomButton label="Show the whole map" onClick={() => bridgeRef.current?.zoomToFit?.()}>
        <Maximize size={15} aria-hidden="true" />
      </ZoomButton>
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl text-white drop-shadow-[0_1px_1.5px_rgba(12,16,32,0.9)] transition hover:bg-[#1b1d2a]/45 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white active:scale-95 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}
