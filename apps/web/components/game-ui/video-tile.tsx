"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, MonitorUp, VideoOff } from "lucide-react";

type TileKind = "camera" | "screen";

type Tile = {
  key: string;
  kind: TileKind;
  label: string;
  initial: string;
  stream: MediaStream | null;
  isSelf: boolean;
};

function hasLiveVideo(stream: MediaStream | null) {
  return !!stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled && !track.muted);
}

// True while the stream has a video track that is actually sending frames.
// Remote tracks turn "muted" when the other person stops their camera or screen.
function useLiveVideo(stream: MediaStream | null) {
  const [live, setLive] = useState(() => hasLiveVideo(stream));
  const trackCount = stream?.getTracks().length ?? 0;

  useEffect(() => {
    const update = () => setLive(hasLiveVideo(stream));
    update();
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    for (const track of tracks) {
      track.addEventListener("mute", update);
      track.addEventListener("unmute", update);
      track.addEventListener("ended", update);
    }
    stream.addEventListener("addtrack", update);
    stream.addEventListener("removetrack", update);
    return () => {
      for (const track of tracks) {
        track.removeEventListener("mute", update);
        track.removeEventListener("unmute", update);
        track.removeEventListener("ended", update);
      }
      stream.removeEventListener("addtrack", update);
      stream.removeEventListener("removetrack", update);
    };
  }, [stream, trackCount]);

  return live;
}

function StreamVideo({
  stream,
  muted,
  mirrored,
  fit,
  hidden,
}: {
  stream: MediaStream;
  muted: boolean;
  mirrored: boolean;
  fit: "cover" | "contain";
  hidden?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${mirrored ? "-scale-x-100" : ""} ${hidden ? "opacity-0" : ""}`}
    />
  );
}

function Placeholder({ tile, large }: { tile: Tile; large?: boolean }) {
  const status = tile.kind === "screen" ? "Screen paused" : tile.stream || tile.isSelf ? "Camera off" : "Connecting…";
  return (
    <div className="absolute inset-0 grid place-items-center bg-neutral-800">
      <div className="flex flex-col items-center gap-1.5">
        {tile.kind === "screen" ? (
          <MonitorUp size={large ? 32 : 18} className="text-neutral-400" aria-hidden="true" />
        ) : (
          <span className={`grid place-items-center rounded-full bg-neutral-700 font-semibold text-neutral-100 ${large ? "h-20 w-20 text-3xl" : "h-9 w-9 text-base"}`}>
            {tile.initial}
          </span>
        )}
        <span className={`flex items-center gap-1 text-neutral-400 ${large ? "text-sm" : "text-[10px]"}`}>
          {tile.kind === "camera" && <VideoOff size={large ? 14 : 10} aria-hidden="true" />}
          {status}
        </span>
      </div>
    </div>
  );
}

function DockTile({ tile, active, onToggle }: { tile: Tile; active: boolean; onToggle: () => void }) {
  const live = useLiveVideo(tile.stream);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${active ? "Shrink" : "Enlarge"} ${tile.label}`}
      className={`group pointer-events-auto relative aspect-video w-44 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-neutral-800 text-left shadow-lg ring-1 transition hover:ring-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? "ring-2 ring-white/70" : "ring-white/10"}`}
    >
      {tile.stream && (
        <StreamVideo
          stream={tile.stream}
          muted={tile.isSelf || tile.kind === "screen"}
          mirrored={tile.isSelf && tile.kind === "camera"}
          fit={tile.kind === "screen" ? "contain" : "cover"}
          hidden={!live}
        />
      )}
      {!live && <Placeholder tile={tile} />}
      <span className="absolute bottom-1 left-1 flex max-w-[calc(100%-0.5rem)] items-center gap-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {tile.kind === "screen" && <MonitorUp size={11} aria-hidden="true" />}
        {tile.label}
      </span>
      <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
        {active ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </span>
    </button>
  );
}

function Spotlight({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const live = useLiveVideo(tile.stream);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 top-16 z-40 flex items-center justify-center px-4 md:pr-56">
      <figure className="pointer-events-auto relative m-0 aspect-video w-[min(100%,1040px,calc((100vh-11rem)*1.7778))] overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl ring-1 ring-white/10">
        {/* Muted: the small tile keeps playing this person's audio, so it is never heard twice. */}
        {tile.stream && (
          <StreamVideo
            stream={tile.stream}
            muted
            mirrored={tile.isSelf && tile.kind === "camera"}
            fit={tile.kind === "screen" ? "contain" : "cover"}
            hidden={!live}
          />
        )}
        {!live && <Placeholder tile={tile} large />}
        <figcaption className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-sm font-medium text-white">
          {tile.kind === "screen" && <MonitorUp size={14} aria-hidden="true" />}
          {tile.label}
        </figcaption>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Shrink ${tile.label}`}
          className="absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <Minimize2 size={16} aria-hidden="true" />
        </button>
      </figure>
    </div>
  );
}

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

export function MediaDock({
  selfName,
  localStream,
  localScreenStream,
  remoteStreams,
  remoteScreenStreams,
  nearbyIds,
  names,
}: {
  selfName: string;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  remoteScreenStreams: Record<string, MediaStream>;
  nearbyIds: Set<string>;
  names: Record<string, string>;
}) {
  const [spotlightKey, setSpotlightKey] = useState<string | null>(null);
  const selfCameraLive = useLiveVideo(localStream);
  const nearby = [...nearbyIds].sort();
  const nameOf = (id: string) => names[id] ?? id.slice(0, 5);

  const tiles: Tile[] = [];
  if (selfCameraLive || nearby.length > 0) {
    tiles.push({ key: "camera:self", kind: "camera", label: "You", initial: initialOf(selfName), stream: localStream, isSelf: true });
  }
  for (const id of nearby) {
    tiles.push({ key: `camera:${id}`, kind: "camera", label: nameOf(id), initial: initialOf(nameOf(id)), stream: remoteStreams[id] ?? null, isSelf: false });
  }
  if (localScreenStream) {
    tiles.push({ key: "screen:self", kind: "screen", label: "Your screen", initial: "", stream: localScreenStream, isSelf: true });
  }
  for (const [id, stream] of Object.entries(remoteScreenStreams)) {
    if (!nearbyIds.has(id)) continue;
    tiles.push({ key: `screen:${id}`, kind: "screen", label: `${nameOf(id)}'s screen`, initial: "", stream, isSelf: false });
  }

  const spotlight = tiles.find((tile) => tile.key === spotlightKey) ?? null;
  const closeSpotlight = () => setSpotlightKey(null);

  if (tiles.length === 0) return null;

  return (
    <>
      <div className="pointer-events-none absolute right-4 top-4 z-30 flex max-h-[calc(100dvh-15rem)] flex-col items-end gap-2 overflow-y-auto p-1">
        {tiles.map((tile) => (
          <ScreenAwareTile
            key={tile.key}
            tile={tile}
            active={tile.key === spotlightKey}
            onToggle={() => setSpotlightKey((current) => (current === tile.key ? null : tile.key))}
          />
        ))}
      </div>
      {spotlight && <Spotlight key={spotlight.key} tile={spotlight} onClose={closeSpotlight} />}
    </>
  );
}

// Remote screen tiles disappear once the other person stops sharing.
function ScreenAwareTile(props: { tile: Tile; active: boolean; onToggle: () => void }) {
  const live = useLiveVideo(props.tile.stream);
  if (props.tile.kind === "screen" && !props.tile.isSelf && !live) return null;
  return <DockTile {...props} />;
}
