"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Gamepad2 } from "lucide-react";
import type { SceneBridge } from "../phaser/scene-bridge";
import { TvOverlay, type SharedTv } from "../tv/tv-overlay";
import { getArcadeGame, isArcadeGameKind, type ArcadeGameKind } from "./arcade-games";
import { ArcadeOverlay, type JoinedGame } from "./arcade-overlay";
import type { PlayLink } from "./play-link";

type Open = { kind: "game"; game: ArcadeGameKind; joined?: JoinedGame } | { kind: "tv" } | null;
type Invite = { fromUserId: string; game: ArcadeGameKind; at: number };
type TvNow = { videoId: string; position: number; byUserId: string; receivedAt: number };

const INVITE_SHOWN_MS = 60_000;
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]";

// Opens the Game Room when the player uses an arcade machine or the ping-pong table, and the TV in
// the Lounge. The game keyboard is off while either is open. With `link` (the space's socket),
// people can invite each other to play, and the TV is shared by everyone in the space.
export function ArcadeOnMap({ bridgeRef, link }: { bridgeRef: RefObject<SceneBridge>; link?: PlayLink }) {
  const [open, setOpen] = useState<Open>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [tv, setTv] = useState<TvNow | null>(null);
  const linkRef = useRef(link);
  linkRef.current = link;

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
    bridge.openGame = (game = "pong") => show({ kind: "game", game: isArcadeGameKind(game) ? game : "pong" });
    bridge.openTv = () => show({ kind: "tv" });
    return () => {
      bridge.openGame = undefined;
      bridge.openTv = undefined;
    };
  }, [bridgeRef, show]);

  const close = useCallback(() => {
    bridgeRef.current.setKeyboardEnabled?.(true);
    setOpen(null);
  }, [bridgeRef]);

  // Invites to play, people taking them back, and what's on the TV.
  const subscribe = link?.subscribe;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((message) => {
      if (message.type === "play-invite") {
        const { fromUserId, game } = message.payload;
        if (!isArcadeGameKind(game)) return;
        setInvites((current) => [...current.filter((invite) => invite.fromUserId !== fromUserId), { fromUserId, game, at: Date.now() }]);
      } else if (message.type === "play-leave") {
        setInvites((current) => current.filter((invite) => invite.fromUserId !== message.payload.fromUserId));
      } else if (message.type === "tv") {
        const state = message.payload.state;
        const receivedAt = Date.now();
        setTv((current) => {
          if (!state) return null;
          // Same video on the same timeline (a sync): keep it, so the player doesn't reload.
          if (current && current.videoId === state.videoId && current.byUserId === state.byUserId) {
            const expected = current.position + (receivedAt - current.receivedAt) / 1000;
            if (Math.abs(expected - state.position) < 3) return current;
          }
          return { ...state, receivedAt };
        });
      }
    });
  }, [subscribe]);

  // Find out what's on the TV once connected.
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
      show({ kind: "game", game: invite.game, joined: { hostId: invite.fromUserId, hostName: nameOf(invite.fromUserId), game: invite.game } });
    }
  };

  const tvByName = tv ? nameOf(tv.byUserId) : "";
  const sharedNow = useMemo(() => (tv ? { videoId: tv.videoId, position: tv.position, receivedAt: tv.receivedAt, byName: tvByName } : null), [tv, tvByName]);
  const sharedTv: SharedTv | undefined = send
    ? {
        now: sharedNow,
        play: (video) => send({ type: "tv", payload: { action: "play", videoId: video.id, start: video.start ?? 0 } }),
        stop: () => send({ type: "tv", payload: { action: "stop" } }),
      }
    : undefined;

  const cards = invites.length > 0 ? <InviteCards invites={invites} nameOf={nameOf} onAnswer={answer} /> : null;

  return (
    <>
      {open?.kind === "game" && (
        <ArcadeOverlay
          key={`${open.game}-${open.joined?.hostId ?? "solo"}`}
          initialGame={open.game}
          joined={open.joined}
          link={link}
          banner={cards}
          onDismiss={close}
        />
      )}
      {open?.kind === "tv" && <TvOverlay shared={sharedTv} banner={cards} onDismiss={close} />}
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
            <strong className="font-semibold">{nameOf(invite.fromUserId)}</strong> wants to play {getArcadeGame(invite.game).title} with you.
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
