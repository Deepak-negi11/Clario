"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Projector, ScreenShareOff } from "lucide-react";
import type { ProjectorShow } from "../../hooks/use-projector";

// The meeting-room projector for the people in the room (hooks/use-projector.ts picks who's on it).
// On the 2D map the shared screen opens big; in 3D it plays on the wall, so it starts as a small
// bar with a way to watch it big. The presenter gets a bar saying they're on, with a way to stop.
// The parent keys it by presenter, so a new presenter opens it again.
// The bar sits under the room name at the top (above the controls on a phone, where the top is
// full); the big view keeps clear of the sidebar and the call.

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const bar =
  "pointer-events-auto absolute bottom-28 left-1/2 z-30 flex sm:bottom-auto sm:top-16 max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-[#1b1d2a]/80 py-1.5 pl-3 pr-1.5 text-[13px] text-white shadow-[0_8px_24px_-14px_rgba(0,0,0,0.5)] ring-1 ring-white/25 backdrop-blur-sm";
const barButton = `inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-white/12 px-3 font-semibold transition hover:bg-white/22 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`;

export function ProjectorView({ show, in3d, onStopSharing }: { show: ProjectorShow; in3d: boolean; onStopSharing: () => void }) {
  const [big, setBig] = useState(!in3d && !show.isSelf);

  useEffect(() => {
    if (!big) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBig(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [big]);

  if (show.isSelf) {
    return (
      <section aria-label="Projector" className={bar}>
        <Projector size={16} aria-hidden="true" className="shrink-0 text-[#ffd479]" />
        <p role="status" className="min-w-0 truncate">
          You&apos;re on the projector in <span className="font-semibold">{show.room.name}</span>
        </p>
        <button type="button" onClick={onStopSharing} className={barButton}>
          <ScreenShareOff size={14} aria-hidden="true" /> Stop sharing
        </button>
      </section>
    );
  }

  if (!big) {
    return (
      <section aria-label="Projector" className={bar}>
        <Projector size={16} aria-hidden="true" className="shrink-0 text-[#ffd479]" />
        <p role="status" className="min-w-0 truncate">
          <span className="font-semibold">{show.name}</span> is presenting
        </p>
        <button type="button" onClick={() => setBig(true)} className={barButton}>
          <Maximize2 size={14} aria-hidden="true" /> Watch
        </button>
      </section>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 top-16 z-40 flex items-center justify-center pl-20 pr-4 md:pl-24 md:pr-52">
      <figure
        aria-label={`Projector: ${show.name}'s screen`}
        className="pointer-events-auto relative m-0 aspect-video w-[min(100%,1100px,calc((100dvh-11rem)*1.7778))] overflow-hidden rounded-2xl bg-[#0c0d12] shadow-2xl ring-1 ring-white/15 starting:scale-[0.97] starting:opacity-0 transition duration-200 ease-out motion-reduce:transition-none"
      >
        <StreamVideo stream={show.stream} />
        <figcaption className="absolute left-3 top-3 flex max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-lg bg-black/65 px-2.5 py-1.5 text-sm text-white">
          <Projector size={15} aria-hidden="true" className="shrink-0 text-[#ffd479]" />
          <span className="truncate">
            <span className="font-semibold">{show.name}</span> is presenting in {show.room.name}
          </span>
        </figcaption>
        <button
          type="button"
          onClick={() => setBig(false)}
          aria-label="Make the projector small"
          className={`absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-black/65 text-white transition hover:bg-black/85 motion-reduce:transition-none ${focusRing}`}
        >
          <Minimize2 size={16} aria-hidden="true" />
        </button>
      </figure>
    </div>
  );
}

function StreamVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  // Muted: a shared screen carries no sound here.
  return <video ref={ref} autoPlay playsInline muted className="h-full w-full object-contain" />;
}
