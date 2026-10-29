"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, Globe, Monitor, X } from "lucide-react";
import { SEATS } from "./arcade-kit";
import { ArcadeCabinet, type CabinetMode } from "./arcade-cabinet";
import { ARCADE_GAMES, getArcadeGame, type ArcadeGameKind, type ArcadeGameSpec } from "./arcade-games";
import { OverlayDialog } from "./overlay-dialog";
import { tableChannel, readMatchData, type Match, type PlayLink, type PlayPeer } from "./play-link";

// The Game Room as a modal. Along the top, the game. Under it, how many are playing and who takes
// the other seats: the computer, people on this device, or people elsewhere in the space (you host
// a table and invite up to three of them). The game plays in the cabinet below. Escape or the close
// button dismisses it; leaving an online game tells the others.

type Who = "computer" | "device" | "online";
export type JoinedGame = { hostId: string; hostName: string; game: ArcadeGameKind };

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]";
const segment = `inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-semibold text-[#5c6371] transition hover:text-[#12151c] aria-pressed:bg-white aria-pressed:text-[#12151c] aria-pressed:shadow-[0_1px_2px_rgba(18,21,28,0.14)] disabled:cursor-default disabled:opacity-40 disabled:hover:text-[#5c6371] motion-reduce:transition-none sm:px-3 sm:text-[13px] ${focusRing}`;
const smallButton = `inline-flex h-8 cursor-pointer items-center rounded-lg bg-[#f4f5f7] px-3 text-[13px] font-semibold text-[#12151c] transition hover:bg-[#e9ebee] motion-reduce:transition-none ${focusRing}`;

function defaults(spec: ArcadeGameSpec): { count: number; who: Who } {
  return { count: spec.soloSeats, who: spec.computer ? "computer" : "device" };
}

export function ArcadeOverlay({
  initialGame = "pong",
  onDismiss,
  link,
  joined,
  banner,
}: {
  initialGame?: ArcadeGameKind;
  onDismiss: () => void;
  // Online play, when opened in a space.
  link?: PlayLink;
  // Opened by accepting someone's invite: you're a guest at their table.
  joined?: JoinedGame;
  // Shown above the game (an invite that arrived while this is open).
  banner?: ReactNode;
}) {
  const [kind, setKind] = useState<ArcadeGameKind>(joined?.game ?? initialGame);
  const spec = getArcadeGame(kind);
  const [count, setCount] = useState(() => defaults(spec).count);
  const [who, setWho] = useState<Who>(() => (joined ? "online" : defaults(spec).who));
  // Hosting: who's joined and who's been asked. Joined: the host and the seating it sent.
  const [guests, setGuests] = useState<PlayPeer[]>([]);
  const [invited, setInvited] = useState<PlayPeer[]>([]);
  const [host, setHost] = useState<{ id: string; name: string } | null>(joined ? { id: joined.hostId, name: joined.hostName } : null);
  const [roster, setRoster] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = useId();

  const selfId = link?.selfId ?? null;
  const send = link?.send;
  const subscribe = link?.subscribe;
  const people = link?.people;
  const nameOf = (id: string) => (id === selfId ? "You" : (people?.find((person) => person.id === id)?.name ?? "Someone"));
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;

  const state = useRef({ guests, invited, host });
  state.current = { guests, invited, host };
  const linkRef = useRef(link);
  linkRef.current = link;

  // Answers to our invites, the seating from our host, and people leaving the table.
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((message) => {
      const { guests: joinedNow, invited: askedNow, host: hostNow } = state.current;
      if (message.type === "play-answer") {
        const from = message.payload.fromUserId;
        const asked = askedNow.find((person) => person.id === from);
        if (!asked) return;
        setInvited((current) => current.filter((person) => person.id !== from));
        if (message.payload.accept) setGuests((current) => (current.some((person) => person.id === from) ? current : [...current, asked]));
        else setNotice(`${asked.name} said not now.`);
      } else if (message.type === "play-leave") {
        const from = message.payload.fromUserId;
        if (hostNow && from === hostNow.id) {
          setHost(null);
          setRoster(null);
          setWho("computer");
          setNotice(`${hostNow.name} ended the game.`);
          return;
        }
        const person = [...joinedNow, ...askedNow].find((candidate) => candidate.id === from);
        if (!person) return;
        setGuests((current) => current.filter((candidate) => candidate.id !== from));
        setInvited((current) => current.filter((candidate) => candidate.id !== from));
        setNotice(joinedNow.some((candidate) => candidate.id === from) ? `${person.name} left the game.` : `${person.name} isn't available.`);
      } else if (message.type === "play-data" && hostNow && message.payload.fromUserId === hostNow.id) {
        const data = readMatchData(message.payload.data);
        if (data?.k === "roster") setRoster(data.ids);
      }
    });
  }, [subscribe]);

  // Hosting: tell the guests who sits where whenever it changes, and every couple of seconds
  // (so a guest who joins late or missed a message catches up).
  const guestIds = guests.map((person) => person.id).join(",");
  useEffect(() => {
    if (!send || !selfId || !guestIds) return;
    const ids = [selfId, ...guestIds.split(",")];
    const tell = () => {
      for (const id of ids.slice(1)) send({ type: "play-data", payload: { targetUserId: id, data: { k: "roster", ids } } });
    };
    tell();
    const timer = window.setInterval(tell, 2_000);
    return () => window.clearInterval(timer);
  }, [send, selfId, guestIds]);

  const leaveTable = useCallback(() => {
    const { guests: joinedNow, invited: askedNow, host: hostNow } = state.current;
    const out = linkRef.current;
    if (!out) return;
    for (const person of [...joinedNow, ...askedNow]) out.send({ type: "play-leave", payload: { targetUserId: person.id } });
    if (hostNow) out.send({ type: "play-leave", payload: { targetUserId: hostNow.id } });
  }, []);

  // Leaving the table: closing the Game Room or switching away from online. The message waits a
  // tick so React's development remount (unmount, then mount again straight away) doesn't send it.
  const leaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
    return () => {
      leaveTimerRef.current = window.setTimeout(leaveTable, 0);
    };
  }, [leaveTable]);

  const choose = (next: Who) => {
    if (next === who) return;
    if (who === "online") {
      leaveTable();
      setGuests([]);
      setInvited([]);
      setHost(null);
      setRoster(null);
    }
    setWho(next);
    setNotice(null);
  };

  const pickGame = (next: ArcadeGameKind) => {
    setKind(next);
    const nextSpec = getArcadeGame(next);
    const fallback = defaults(nextSpec);
    // Against the computer each game starts as it's usually played; a group on this device stays together.
    setCount((current) => (who === "device" ? Math.min(nextSpec.players.max, Math.max(2, nextSpec.players.min, current)) : fallback.count));
    if (who === "computer" && !nextSpec.computer) setWho(fallback.who);
  };

  const invite = (person: PlayPeer) => {
    if (!send) return;
    send({ type: "play-invite", payload: { targetUserId: person.id, game: kind } });
    setInvited((current) => [...current.filter((candidate) => candidate.id !== person.id), person]);
    setNotice(null);
  };

  const uninvite = (person: PlayPeer) => {
    send?.({ type: "play-leave", payload: { targetUserId: person.id } });
    setInvited((current) => current.filter((candidate) => candidate.id !== person.id));
    setGuests((current) => current.filter((candidate) => candidate.id !== person.id));
  };

  // The match the cabinet plays, if any, from this player's side.
  const rosterKey = roster?.join(",") ?? "";
  const hostId = host?.id ?? null;
  const match = useMemo<Match | null>(() => {
    if (!send || !subscribe || !selfId) return null;
    if (hostId) {
      const ids = rosterKey ? rosterKey.split(",") : [];
      const mySeat = ids.indexOf(selfId);
      if (mySeat < 0) return null;
      return {
        role: "guest",
        seats: ids.map((id) => ({ name: nameOfRef.current(id), bot: false })),
        mySeat,
        peers: [{ id: hostId, seat: 0 }],
        ...tableChannel({ send, subscribe }, [hostId]),
      };
    }
    if (!guestIds) return null;
    const ids = guestIds.split(",");
    return {
      role: "host",
      seats: [{ name: "You", bot: false }, ...ids.map((id) => ({ name: nameOfRef.current(id), bot: false }))],
      mySeat: 0,
      peers: ids.map((id, index) => ({ id, seat: index + 1 })),
      ...tableChannel({ send, subscribe }, ids),
    };
  }, [send, subscribe, selfId, hostId, rosterKey, guestIds]);

  const mode: CabinetMode | null =
    who === "online"
      ? match
        ? { kind: "online", match }
        : hostId
          ? null // joining: waiting for the host's seating
          : { kind: "solo", seats: spec.soloSeats }
      : count === 1
        ? { kind: "solo", seats: 1 }
        : who === "device"
          ? { kind: "local", seats: count }
          : { kind: "solo", seats: spec.computer ? count : 1 };

  const atTable = guests.length > 0 || invited.length > 0 || !!hostId;
  const room = spec.players.max - 1 - guests.length - invited.length;
  const invitable = (people ?? []).filter((person) => !guests.some((guest) => guest.id === person.id) && !invited.some((asked) => asked.id === person.id));
  const countOptions = [1, 2, 3, 4];

  return (
    <OverlayDialog labelledBy={titleId} onDismiss={onDismiss} className="w-[min(48rem,calc(100vw-1rem))]">
      <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-3 text-[#12151c] shadow-[0_24px_60px_-24px_rgba(18,21,28,0.45)] sm:p-4">
        {banner}
        <header className="flex items-center gap-3">
          <h2 id={titleId} className="sr-only font-[family-name:var(--font-pixel)] text-lg sm:not-sr-only">
            Game Room
          </h2>
          <div role="group" aria-label="Choose a game" className="grid min-w-0 grid-cols-4 gap-1 rounded-xl bg-[#f1f2f4] p-1 sm:ml-auto">
            {ARCADE_GAMES.map((game) => (
              <button key={game.kind} type="button" aria-pressed={game.kind === kind} disabled={atTable} onClick={() => pickGame(game.kind)} className={segment}>
                {game.short}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close the Game Room"
            className={`ml-auto grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] sm:ml-0 motion-reduce:transition-none ${focusRing}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {who !== "online" && (
            <div role="group" aria-label="Players" className="flex items-center gap-1 rounded-xl bg-[#f1f2f4] p-1">
              <span className="px-1.5 text-[12px] font-medium text-[#5c6371]">Players</span>
              {countOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={count === option}
                  aria-label={`${option} ${option === 1 ? "player" : "players"}`}
                  disabled={option < spec.players.min || option > spec.players.max}
                  onClick={() => {
                    setCount(option);
                    // Two or more without the computer available: they're people on this device.
                    if (option > 1 && who === "computer" && !spec.computer) setWho("device");
                  }}
                  className={`${segment} w-8 px-0 sm:px-0`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          {(count > 1 || who === "online" || !!link) && (
            <div role="group" aria-label="Who takes the other seats" className="flex gap-1 rounded-xl bg-[#f1f2f4] p-1">
              {spec.computer && (count > 1 || who === "online") && (
                <button type="button" aria-pressed={who === "computer"} onClick={() => choose("computer")} className={segment}>
                  <Bot size={14} aria-hidden="true" /> Computer
                </button>
              )}
              {(count > 1 || who === "online") && (
                <button
                  type="button"
                  aria-pressed={who === "device"}
                  onClick={() => {
                    choose("device");
                    if (count < 2) setCount(2);
                  }}
                  className={segment}
                >
                  <Monitor size={14} aria-hidden="true" /> This device
                </button>
              )}
              {link && (
                <button type="button" aria-pressed={who === "online"} onClick={() => choose("online")} className={segment}>
                  <Globe size={14} aria-hidden="true" /> Online
                </button>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="text-[13px] text-[#4b5260]">
              {notice}
            </p>
          )}
        </div>

        {who === "online" && link && (
          <div className="flex flex-col gap-2 rounded-xl border border-[#eceef1] p-2.5">
            {hostId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span>
                  {match ? "Playing at " : "Joining "}
                  <strong className="font-semibold">{host?.name}</strong>&apos;s table{match ? "" : "…"}
                </span>
                <button type="button" className={smallButton} onClick={() => choose("computer")}>
                  Leave
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="mr-1 text-[#4b5260]">Your table:</span>
                  <Chip seat={0} name="You" />
                  {guests.map((guest, index) => (
                    <Chip key={guest.id} seat={index + 1} name={guest.name} onRemove={() => uninvite(guest)} />
                  ))}
                  {invited.map((person) => (
                    <Chip key={person.id} name={`${person.name}…`} waiting onRemove={() => uninvite(person)} />
                  ))}
                  {guests.length === 0 && invited.length === 0 && <span className="text-[#6b7180]">invite up to {spec.players.max - 1} people below</span>}
                </div>
                {room > 0 &&
                  (invitable.length === 0 ? (
                    <p className="text-[12.5px] text-[#6b7180]">{people?.length ? "Everyone here is already invited." : "No one else is in this space right now."}</p>
                  ) : (
                    <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" aria-label={`Invite to ${spec.title}`}>
                      {invitable.map((person) => (
                        <li key={person.id}>
                          <button
                            type="button"
                            onClick={() => invite(person)}
                            className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#e3e5e8] px-2.5 text-[13px] transition hover:border-[#12151c] motion-reduce:transition-none ${focusRing}`}
                          >
                            <span className="max-w-[9rem] truncate font-medium">{person.name}</span>
                            <span className="text-[12px] font-semibold text-[#1c4a86]">Invite</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ))}
                {guests.length === 0 && <p className="text-[12px] text-[#6b7180]">Play on your own while you wait; the game resets when someone joins.</p>}
              </>
            )}
          </div>
        )}

        {mode ? (
          <ArcadeCabinet key={`${kind}-${mode.kind}-${mode.kind === "online" ? mode.match.seats.length : mode.seats}-${rosterKey}-${guestIds}`} spec={spec} mode={mode} />
        ) : (
          <div className="grid aspect-[3/2] place-items-center rounded-xl bg-[#f4f5f7] text-center text-[13px] text-[#4b5260]" role="status">
            Waiting for {host?.name} to seat you…
          </div>
        )}
      </div>
    </OverlayDialog>
  );
}

function Chip({ name, seat, waiting, onRemove }: { name: string; seat?: number; waiting?: boolean; onRemove?: () => void }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border border-[#e3e5e8] pl-2 ${onRemove ? "pr-1" : "pr-2.5"} ${waiting ? "text-[#6b7180]" : ""}`}>
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${waiting ? "border border-dashed border-[#8a909b]" : ""}`}
        style={seat !== undefined ? { background: SEATS[seat]!.color } : undefined}
      />
      <span className="max-w-[8rem] truncate text-[12.5px] font-medium">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className={`grid h-5 w-5 cursor-pointer place-items-center rounded-full text-[#6b7180] hover:bg-[#f1f2f4] hover:text-[#12151c] ${focusRing}`}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
