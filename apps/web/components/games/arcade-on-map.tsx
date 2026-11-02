"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Gamepad2 } from "lucide-react";
import type { PlayClientMessage } from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import { TvOverlay } from "../tv/tv-overlay";
import { TvRemote } from "../tv/tv-remote";
import { createTvStore, type TvStore } from "../tv/tv-store";
import type { TvScreenRef } from "../../lib/maps/play-spots";
import { getArcadeGame, isArcadeGameKind, type ArcadeGameKind } from "./arcade-games";
import { ArcadeOverlay, type JoinedGame } from "./arcade-overlay";
import type { PlayLink } from "./play-link";
import { TetrisOverlay } from "./tetris-overlay";

// Tetris opens on its own cabinet; `joined` when you accepted someone's invite to play it online,
// and `joinedAt` that invite's time, so each one you accept opens a new table (even from the same host).
type Open =
  | { kind: "game"; game: ArcadeGameKind; joined?: JoinedGame; joinedAt?: number }
  | { kind: "tetris"; joined?: { hostId: string; hostName: string }; joinedAt?: number }
  | { kind: "tv"; screen: TvScreenRef }
  | null;
type Invite = { fromUserId: string; game: ArcadeGameKind | "tetris"; at: number };
type TvPayload = Extract<PlayClientMessage, { type: "tv" }>["payload"];
type TvNow = { videoId: string; position: number; byUserId: string; receivedAt: number; paused: boolean; title?: string };
type TvChannels = Record<string, TvNow>; // screen id -> what's on it

// A TV opened without saying which (nothing does that now): the first one on Clario HQ's list.
const SOME_TV: TvScreenRef = { id: "tv:31,15", name: "Lounge TV" };

const INVITE_SHOWN_MS = 60_000;
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]";

// Opens the Game Room when the player uses an arcade machine or the ping-pong table, and a TV when
// they use one (the Lounge TV, the Demo Stage screen...). The game keyboard is off while either is
// open. With `link` (the space's socket), people can invite each other to play, and each TV's
// channel is shared by everyone in the space.
// Each TV's channel lives in its own store, which the bridge hands out (bridge.tv): on the 2D map a
// TV opens big; in the 3D office, where the video plays on the screen itself, it opens the remote.
export function ArcadeOnMap({ bridgeRef, link }: { bridgeRef: RefObject<SceneBridge>; link?: PlayLink }) {
  const [open, setOpen] = useState<Open>(null);
  const [remote, setRemote] = useState<TvScreenRef | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [tvs, setTvs] = useState<TvChannels>({});
  const linkRef = useRef(link);
  linkRef.current = link;

  // One store per screen, made the first time something asks for it. Remote and overlay buttons go
  // to the space when there is one; otherwise the TVs are just yours.
  const storesRef = useRef(new Map<string, TvStore>());
  const channelOfRef = useRef<(id: string) => Parameters<TvStore["setChannel"]>[0]>(() => null);
  const storeFor = useCallback((screen: TvScreenRef) => {
    const known = storesRef.current.get(screen.id);
    if (known) {
      // The 3D view asks by id only; a spot knows the name.
      if (screen.name !== "TV") known.name = screen.name;
      return known;
    }
    const id = screen.id;
    const tvSend = (payload: TvPayload) => {
      const out = linkRef.current;
      if (!out) return false;
      out.send({ type: "tv", payload });
      return true;
    };
    const local = (update: (current: TvNow | undefined) => TvNow | undefined) =>
      setTvs((current) => {
        const next = { ...current };
        const value = update(current[id]);
        if (value) next[id] = value;
        else delete next[id];
        return next;
      });
    const store = createTvStore(
      {
        play: (video) => {
          if (tvSend({ action: "play", screen: id, videoId: video.id, start: video.start ?? 0, ...(video.title ? { title: video.title.slice(0, 200) } : {}) })) return;
          local(() => ({ videoId: video.id, position: video.start ?? 0, byUserId: "", receivedAt: Date.now(), paused: false, title: video.title }));
        },
        pause: () => {
          if (tvSend({ action: "pause", screen: id })) return;
          local((current) => (current && !current.paused ? { ...current, position: current.position + (Date.now() - current.receivedAt) / 1000, receivedAt: Date.now(), paused: true } : current));
        },
        resume: () => {
          if (tvSend({ action: "resume", screen: id })) return;
          local((current) => (current?.paused ? { ...current, receivedAt: Date.now(), paused: false } : current));
        },
        stop: () => {
          if (tvSend({ action: "stop", screen: id })) return;
          local(() => undefined);
        },
      },
      screen,
    );
    store.setChannel(channelOfRef.current(id));
    storesRef.current.set(id, store);
    return store;
  }, []);

  const show = useCallback(
    (next: Exclude<Open, null>) => {
      bridgeRef.current.setKeyboardEnabled?.(false);
      if (next.kind === "tv") linkRef.current?.send({ type: "tv", payload: { action: "sync" } });
      setOpen(next);
    },
    [bridgeRef],
  );

  useEffect(() => {
    const bridge = bridgeRef.current;
    // The arcade machines play Tetris on the cabinet; everything else opens the Game Room.
    bridge.openGame = (game = "pong") => show(game === "tetris" ? { kind: "tetris" } : { kind: "game", game: isArcadeGameKind(game) ? game : "pong" });
    // In the 3D office the TV is on its screen: pick up its remote instead of opening it big.
    bridge.openTv = (screen = SOME_TV) => {
      if (storeFor(screen).onScreen) {
        linkRef.current?.send({ type: "tv", payload: { action: "sync" } });
        setRemote(screen);
      } else show({ kind: "tv", screen });
    };
    bridge.tv = (screenId) => storeFor({ id: screenId, name: "TV" });
    return () => {
      bridge.openGame = undefined;
      bridge.openTv = undefined;
      bridge.tv = undefined;
    };
  }, [bridgeRef, show, storeFor]);

  const close = useCallback(() => {
    bridgeRef.current.setKeyboardEnabled?.(true);
    setOpen(null);
  }, [bridgeRef]);

  // Invites to play, people taking them back, and what's on the TVs.
  const subscribe = link?.subscribe;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((message) => {
      if (message.type === "play-invite") {
        const { fromUserId, game } = message.payload;
        if (!isArcadeGameKind(game) && game !== "tetris") return;
        setInvites((current) => [...current.filter((invite) => invite.fromUserId !== fromUserId), { fromUserId, game, at: Date.now() }]);
      } else if (message.type === "play-leave") {
        setInvites((current) => current.filter((invite) => invite.fromUserId !== message.payload.fromUserId));
      } else if (message.type === "tv") {
        // Every screen's state; one that isn't listed is off.
        const receivedAt = Date.now();
        setTvs((current) => {
          const next: TvChannels = {};
          for (const [screen, state] of Object.entries(message.payload.screens)) {
            const kept = current[screen];
            // Same video on the same timeline (a sync): keep it, so the player doesn't reload.
            if (kept && kept.videoId === state.videoId && kept.byUserId === state.byUserId && kept.paused === state.paused) {
              const expected = kept.paused ? kept.position : kept.position + (receivedAt - kept.receivedAt) / 1000;
              if (Math.abs(expected - state.position) < 3) {
                next[screen] = kept;
                continue;
              }
            }
            next[screen] = { ...state, receivedAt };
          }
          return next;
        });
      }
    });
  }, [subscribe]);

  // Find out what's on the TVs once connected.
  const selfId = link?.selfId ?? null;
  const send = link?.send;
  useEffect(() => {
    if (selfId && send) send({ type: "tv", payload: { action: "sync" } });
  }, [selfId, send]);

  // Unanswered invites go away after a minute.
  useEffect(() => {
    if (invites.length === 0) return;
    const timer = window.setTimeout(() => {
      setInvites((current) => current.filter((invite) => Date.now() - invite.at < INVITE_SHOWN_MS));
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [invites]);

  const people = link?.people;
  const nameOf = useCallback(
    (userId: string) => (userId === selfId ? "you" : (people?.find((person) => person.id === userId)?.name ?? "Someone")),
    [people, selfId],
  );

  const answer = (invite: Invite, accept: boolean) => {
    setInvites((current) => current.filter((item) => item.fromUserId !== invite.fromUserId));
    link?.send({ type: "play-answer", payload: { targetUserId: invite.fromUserId, accept } });
    if (accept) {
      const host = { hostId: invite.fromUserId, hostName: nameOf(invite.fromUserId) };
      show(
        invite.game === "tetris"
          ? { kind: "tetris", joined: host, joinedAt: invite.at }
          : { kind: "game", game: invite.game, joined: { ...host, game: invite.game }, joinedAt: invite.at },
      );
    }
  };

  // Keep each store's channel in step with what's on (and who put it on, by name).
  const channelOf = useCallback(
    (id: string) => {
      const tv = tvs[id];
      return tv ? { videoId: tv.videoId, position: tv.position, paused: tv.paused, receivedAt: tv.receivedAt, byName: tv.byUserId ? nameOf(tv.byUserId) : "you", title: tv.title } : null;
    },
    [tvs, nameOf],
  );
  useEffect(() => {
    channelOfRef.current = channelOf;
    for (const [id, store] of storesRef.current) {
      const next = channelOf(id);
      const now = store.channel();
      // Only when something changed, so the screens don't reload.
      if (JSON.stringify(next) !== JSON.stringify(now)) store.setChannel(next);
    }
  }, [channelOf]);

  const cards = invites.length > 0 ? <InviteCards invites={invites} nameOf={nameOf} onAnswer={answer} /> : null;

  return (
    <>
      {open?.kind === "game" && (
        <ArcadeOverlay
          key={`${open.game}-${open.joinedAt ?? "solo"}`}
          initialGame={open.game}
          joined={open.joined}
          link={link}
          banner={cards}
          onDismiss={close}
        />
      )}
      {open?.kind === "tetris" && (
        <TetrisOverlay
          key={open.joinedAt ?? "solo"}
          link={link}
          joined={open.joined}
          banner={cards}
          onDismiss={close}
          onMoreGames={() => show({ kind: "game", game: "pong" })}
        />
      )}
      {open?.kind === "tv" && <TvOverlay key={open.screen.id} store={storeFor(open.screen)} shared={!!send} banner={cards} onDismiss={close} />}
      {remote && (
        <TvRemote
          key={remote.id}
          store={storeFor(remote)}
          shared={!!send}
          onClose={() => setRemote(null)}
          onWatchBig={() => {
            setRemote(null);
            show({ kind: "tv", screen: remote });
          }}
        />
      )}
      {/* With nothing open, invites pop up over the map. */}
      {!open && cards && (
        <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[80] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2">{cards}</div>
      )}
    </>
  );
}

function InviteCards({
  invites,
  nameOf,
  onAnswer,
}: {
  invites: Invite[];
  nameOf: (userId: string) => string;
  onAnswer: (invite: Invite, accept: boolean) => void;
}) {
  return (
    <ul aria-label="Game invites" aria-live="polite" className="mb-3 flex flex-col gap-2">
      {invites.map((invite) => (
        <li
          key={invite.fromUserId}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-black/5 bg-white px-3 py-2.5 text-[#12151c] shadow-[0_12px_32px_-14px_rgba(18,21,28,0.45)] starting:translate-y-1 starting:opacity-0 transition-[opacity,translate] duration-200 motion-reduce:transition-none"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f4f5f7]">
            <Gamepad2 size={16} aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-snug">
            <strong className="font-semibold">{nameOf(invite.fromUserId)}</strong> wants to play {invite.game === "tetris" ? "Tetris" : getArcadeGame(invite.game).title} with you.
          </p>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => onAnswer(invite, true)}
              className={`h-8 cursor-pointer rounded-lg bg-[#12151c] px-3 text-[13px] font-semibold text-white transition hover:bg-black motion-reduce:transition-none ${focusRing}`}
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => onAnswer(invite, false)}
              className={`h-8 cursor-pointer rounded-lg bg-[#f4f5f7] px-3 text-[13px] font-semibold text-[#12151c] transition hover:bg-[#e9ebee] motion-reduce:transition-none ${focusRing}`}
            >
              Not now
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
