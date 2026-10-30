import { useEffect, useRef, type RefObject } from "react";
import { youTubeEmbedUrl } from "@repo/shared";
import { positionNow, type TvChannel } from "./tv-store";

// One YouTube player in a container: the embedded player from youtube-nocookie.com with its IFrame
// API turned on, steered with postMessage (pause, play, seek, volume). The same player shows in the
// big TV overlay and on the 3D office's TV. It never hides YouTube's own controls, ads or branding.

const YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";
const READY_FALLBACK_MS = 2_500;

export type TvPlayer = {
  show: (channel: TvChannel | null) => void;
  // 0 to 100; 0 mutes.
  setVolume: (volume: number) => void;
  dispose: () => void;
};

export function createTvPlayer(container: HTMLElement, title = "YouTube video on the Lounge TV"): TvPlayer {
  let iframe: HTMLIFrameElement | null = null;
  let current: { videoId: string; paused: boolean } | null = null;
  let ready = false;
  let pending: [string, unknown[]][] = [];
  let volume = -1;
  let readyTimer = 0;

  const send = (func: string, args: unknown[] = []) => {
    if (!iframe || !ready) {
      pending = [...pending.filter(([name]) => name !== func), [func, args]];
      return;
    }
    iframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YOUTUBE_ORIGIN);
  };

  const becomeReady = () => {
    if (ready) return;
    ready = true;
    window.clearTimeout(readyTimer);
    const queued = pending;
    pending = [];
    for (const [func, args] of queued) send(func, args);
  };

  // The player says it's ready once we've said we're listening.
  const onMessage = (event: MessageEvent) => {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== YOUTUBE_ORIGIN) return;
    try {
      const data = JSON.parse(String(event.data)) as { event?: string };
      if (data.event === "onReady" || data.event === "initialDelivery") becomeReady();
    } catch {
      // Not one of the player's messages.
    }
  };
  window.addEventListener("message", onMessage);

  const load = (channel: TvChannel) => {
    iframe?.remove();
    ready = false;
    pending = [];
    window.clearTimeout(readyTimer);
    const frame = document.createElement("iframe");
    frame.src = youTubeEmbedUrl(
      { id: channel.videoId, start: Math.floor(positionNow(channel)) },
      { autoplay: !channel.paused, api: true, origin: window.location.origin },
    );
    frame.title = title;
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    Object.assign(frame.style, { position: "absolute", inset: "0", width: "100%", height: "100%", border: "0" });
    frame.addEventListener("load", () => {
      frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YOUTUBE_ORIGIN);
      readyTimer = window.setTimeout(becomeReady, READY_FALLBACK_MS);
    });
    container.appendChild(frame);
    iframe = frame;
    if (volume >= 0) applyVolume(volume);
  };

  const applyVolume = (value: number) => {
    send("setVolume", [value]);
    send(value === 0 ? "mute" : "unMute");
  };

  return {
    show(channel) {
      if (!channel) {
        iframe?.remove();
        iframe = null;
        current = null;
        return;
      }
      if (!current || current.videoId !== channel.videoId || !iframe) {
        load(channel);
      } else if (current.paused !== channel.paused) {
        // Everyone lands on the same frame: seek to the shared position, then pause or play.
        send("seekTo", [positionNow(channel), true]);
        send(channel.paused ? "pauseVideo" : "playVideo");
      }
      current = { videoId: channel.videoId, paused: channel.paused };
    },
    setVolume(next) {
      const value = Math.max(0, Math.min(100, Math.round(next)));
      if (value === volume) return;
      volume = value;
      applyVolume(value);
    },
    dispose() {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(readyTimer);
      iframe?.remove();
      iframe = null;
    },
  };
}

// The player in a React container, following a channel and a volume.
export function useTvPlayer(container: RefObject<HTMLElement | null>, channel: TvChannel | null, volume: number) {
  const playerRef = useRef<TvPlayer | null>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const player = createTvPlayer(element);
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, [container]);
  useEffect(() => {
    playerRef.current?.show(channel);
  }, [channel]);
  useEffect(() => {
    playerRef.current?.setVolume(volume);
  }, [volume]);
}
