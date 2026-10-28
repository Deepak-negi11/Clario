"use client";

import type { RefObject } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import type { SceneBridge } from "../phaser/scene-bridge";

// Zoom buttons floating over the map, in the same surface as the left rail.
export function MapControls({ bridgeRef }: { bridgeRef: RefObject<SceneBridge> }) {
  return (
    <div
      role="group"
      aria-label="Map zoom"
      className="pointer-events-auto absolute bottom-20 right-4 z-40 flex flex-col gap-0.5 rounded-2xl bg-[#1b1d2a]/20 p-1 ring-1 ring-white/30 backdrop-blur-[3px] md:bottom-4"
    >
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
