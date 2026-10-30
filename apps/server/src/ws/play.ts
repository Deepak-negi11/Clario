// Game Room play between people in a space, and the Lounge TV the whole space shares.
// Someone hosts a table and invites people; each one who accepts takes a seat (four at most), and
// only then does game traffic flow between them. Kept in memory like the rest of the room state,
// so it resets on restart.

export type PlayGame = "pong" | "breakout" | "snake" | "sumo" | "tetris";

export const TABLE_SEATS = 4;
// An invite nobody answered stops counting after this long.
export const INVITE_TTL_MS = 60_000;
// Game traffic one person may send another per second (the games send about 30).
export const PLAY_MESSAGES_PER_SECOND = 70;
// How often one person may change what's on the TV.
export const TV_CHANGE_EVERY_MS = 1_500;

// players[0] is the host.
type Table = { game: PlayGame; players: string[]; invites: Map<string, number> };

// start: seconds into the video at startedAt. pausedAt: when it was paused, if it is.
export type TvNow = { videoId: string; start: number; startedAt: number; byUserId: string; pausedAt?: number; title?: string };

const spaces = new Map<string, Map<string, Table>>(); // space -> host -> table
const tvs = new Map<string, TvNow>();
const sent = new Map<string, { windowStart: number; count: number }>();
const tvChangedAt = new Map<string, number>();

function tablesFor(spaceId: string) {
  let tables = spaces.get(spaceId);
  if (!tables) {
    tables = new Map();
    spaces.set(spaceId, tables);
  }
  return tables;
}

function tidy(spaceId: string) {
  const tables = spaces.get(spaceId);
  if (!tables) return;
  for (const [hostId, table] of tables) if (table.players.length <= 1 && table.invites.size === 0) tables.delete(hostId);
  if (tables.size === 0) spaces.delete(spaceId);
}

// Take someone out of every table they're at (as a guest, or as the host, which ends that table)
// and of every invite to them. Returns who to tell they've gone.
function unseat(spaceId: string, userId: string) {
  const tables = spaces.get(spaceId);
  const notify = new Set<string>();
  if (!tables) return [];
  const own = tables.get(userId);
  if (own) {
    for (const player of own.players.slice(1)) notify.add(player);
    for (const invitee of own.invites.keys()) notify.add(invitee);
    tables.delete(userId);
  }
  for (const [hostId, table] of tables) {
    if (table.players.includes(userId)) {
      table.players = table.players.filter((player) => player !== userId);
      notify.add(hostId);
    }
    if (table.invites.delete(userId)) notify.add(hostId);
  }
  tidy(spaceId);
  return [...notify];
}

// Invite someone to your table (it's set up on the first invite). False when the table is full.
export function invitePlay(spaceId: string, hostId: string, toUserId: string, game: PlayGame, now = Date.now()) {
  const tables = tablesFor(spaceId);
  // A guest at someone else's table who starts inviting is hosting now: they leave that table.
  const notify: string[] = [];
  for (const [otherHost, table] of tables) {
    if (otherHost !== hostId && table.players.includes(hostId)) {
      table.players = table.players.filter((player) => player !== hostId);
      notify.push(otherHost);
    }
  }
  let table = tables.get(hostId);
  if (!table) {
    table = { game, players: [hostId], invites: new Map() };
    tables.set(hostId, table);
  }
  if (table.players.length >= TABLE_SEATS) return { ok: false, notify };
  if (table.players.length === 1) table.game = game; // nobody seated yet: the game can still change
  table.invites.set(toUserId, now);
  return { ok: true, notify };
}

// The invited person answers. Yes: they take a seat and get the game and who's at the table (and
// leave any other table, whose people should be told: `notify`). No: null. No live invite, or the
// table filled up in the meantime: false.
export function answerPlay(spaceId: string, responderId: string, hostId: string, accept: boolean, now = Date.now()) {
  const table = spaces.get(spaceId)?.get(hostId);
  const at = table?.invites.get(responderId);
  if (!table || at === undefined) return false;
  table.invites.delete(responderId);
  if (now - at > INVITE_TTL_MS || (accept && table.players.length >= TABLE_SEATS)) {
    tidy(spaceId);
    return false;
  }
  if (!accept) {
    tidy(spaceId);
    return null;
  }
  const notify = unseat(spaceId, responderId).filter((id) => id !== hostId);
  // unseat may have tidied the table away while it had no guests: put it back.
  const tables = tablesFor(spaceId);
  tables.set(hostId, table);
  table.players.push(responderId);
  return { game: table.game, players: [...table.players], notify };
}

// Two people at the same table.
export function arePlaying(spaceId: string, a: string, b: string) {
  for (const table of spaces.get(spaceId)?.values() ?? []) if (table.players.includes(a) && table.players.includes(b)) return true;
  return false;
}

// One person ends things with another: a host takes back an invite or lets a guest go, a guest
// leaves the table, an invited person turns it down late. True when there was something to end.
export function leavePlay(spaceId: string, userId: string, otherUserId: string) {
  const tables = spaces.get(spaceId);
  if (!tables) return false;
  let ended = false;
  for (const [hostId, table] of tables) {
    const guest = hostId === userId ? otherUserId : hostId === otherUserId ? userId : null;
    if (!guest) continue;
    if (table.players.includes(guest)) {
      table.players = table.players.filter((player) => player !== guest);
      ended = true;
    }
    if (table.invites.delete(guest)) ended = true;
  }
  tidy(spaceId);
  return ended;
}

// Someone left the space: end their invites and tables, and say who to tell.
export function forgetPlay(spaceId: string, userId: string) {
  const notify = unseat(spaceId, userId);
  sent.delete(userId);
  for (const key of sent.keys()) if (key.startsWith(`${userId}>`) || key.endsWith(`>${userId}`)) sent.delete(key);
  tvChangedAt.delete(userId);
  return notify;
}

// A per-second budget for game traffic from one person to another, so nobody can flood anyone.
export function allowPlayMessage(fromUserId: string, toUserId: string, now = Date.now()) {
  const key = `${fromUserId}>${toUserId}`;
  const window = sent.get(key);
  if (!window || now - window.windowStart >= 1_000) {
    sent.set(key, { windowStart: now, count: 1 });
    return true;
  }
  window.count++;
  return window.count <= PLAY_MESSAGES_PER_SECOND;
}

// The TV. position is how far into the video it is now (or where it was paused), in seconds.
export function tvState(spaceId: string, now = Date.now()) {
  const tv = tvs.get(spaceId);
  if (!tv) return null;
  const until = tv.pausedAt ?? now;
  return {
    videoId: tv.videoId,
    position: tv.start + Math.max(0, until - tv.startedAt) / 1000,
    byUserId: tv.byUserId,
    paused: tv.pausedAt !== undefined,
    ...(tv.title ? { title: tv.title } : {}),
  };
}

// Put a video on (or switch it off with null). False when this person changed it too recently.
export function setTv(spaceId: string, userId: string, video: { videoId: string; start: number; title?: string } | null, now = Date.now()) {
  const last = tvChangedAt.get(userId);
  if (last !== undefined && now - last < TV_CHANGE_EVERY_MS) return false;
  tvChangedAt.set(userId, now);
  if (video) tvs.set(spaceId, { ...video, startedAt: now, byUserId: userId });
  else tvs.delete(spaceId);
  return true;
}

// Pause the TV for everyone, or carry on from where it was paused. False when nothing's on, it's
// already that way, or this person changed it too recently.
export function pauseTv(spaceId: string, userId: string, paused: boolean, now = Date.now()) {
  const tv = tvs.get(spaceId);
  if (!tv || (tv.pausedAt !== undefined) === paused) return false;
  const last = tvChangedAt.get(userId);
  if (last !== undefined && now - last < TV_CHANGE_EVERY_MS) return false;
  tvChangedAt.set(userId, now);
  if (paused) tv.pausedAt = now;
  else {
    tv.start += Math.max(0, tv.pausedAt! - tv.startedAt) / 1000;
    tv.startedAt = now;
    tv.pausedAt = undefined;
  }
  return true;
}

// The last person left the space: the tables go and the TV goes off.
export function forgetSpacePlay(spaceId: string) {
  spaces.delete(spaceId);
  tvs.delete(spaceId);
}
