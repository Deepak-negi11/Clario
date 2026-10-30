import type { YouTubeVideo } from "@repo/shared";

// The Lounge TV's channel for one page: what's on, whether it's paused, and how loud it is here.
// ArcadeOnMap owns it and keeps it in step with the space (or plays on its own without one); the
// big TV overlay, the remote and the 3D office's TV screen all read it. It lives on the scene
// bridge (bridge.tv) so the 3D view can reach it.

export type TvChannel = {
  videoId: string;
  // Seconds into the video at receivedAt (Date.now()); it stays put while paused.
  position: number;
  paused: boolean;
  byName: string;
  receivedAt: number;
  // The video's title when whoever put it on knew it (a search result or a preset).
  title?: string;
};

export type TvActions = {
  play: (video: YouTubeVideo & { title?: string }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export type TvStore = TvActions & {
  channel: () => TvChannel | null;
  // 0 to 100, this viewer only.
  volume: () => number;
  muted: () => boolean;
  subscribe: (listener: () => void) => () => void;
  setChannel: (channel: TvChannel | null) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  // True while the 3D view shows the TV on its screen: then the TV opens the remote, not the overlay.
  onScreen: boolean;
};

const VOLUME_KEY = "tv:volume";

function readVolume() {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.min(100, stored) : 70;
  } catch {
    return 70;
  }
}

export function createTvStore(actions: TvActions): TvStore {
  let channel: TvChannel | null = null;
  let volume = readVolume();
  let muted = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    ...actions,
    channel: () => channel,
    volume: () => volume,
    muted: () => muted,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setChannel(next) {
      channel = next;
      notify();
    },
    setVolume(next) {
      volume = Math.max(0, Math.min(100, Math.round(next)));
      muted = volume === 0;
      try {
        localStorage.setItem(VOLUME_KEY, String(volume));
      } catch {
        // Not remembered: fine.
      }
      notify();
    },
    setMuted(next) {
      muted = next;
      notify();
    },
    onScreen: false,
  };
}

// Where the video is now, in seconds.
export function positionNow(channel: TvChannel, now = Date.now()) {
  return channel.paused ? channel.position : channel.position + Math.max(0, now - channel.receivedAt) / 1000;
}
