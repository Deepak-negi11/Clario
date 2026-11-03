import { redis } from "./redis";

export type Position = { x: number; y: number };
export type RoomUser = { userId: string } & Position;








function positionsKey(spaceId: string): string {
  return `space:${spaceId}:positions`;
}




// Who is in a space, as leases: each person with the time their lease was last renewed. The server
// they are connected to renews it (renewPresence in ws-handler.ts) and onClose ends it. A server that goes
// away without running onClose (a crash, a `bun --watch` restart) stops renewing, so its people
// drop out on their own. (It replaced `space:<id>:online`, a set that kept them online for good.)
function onlineKey(spaceId: string): string {
  return `space:${spaceId}:presence`;
}

export const PRESENCE_RENEW_MS = 5_000;
// Three missed renewals.
export const PRESENCE_LEASE_MS = 15_000;

// Leases renewed at or before this time have run out.
function leaseCutoff() {
  return Date.now() - PRESENCE_LEASE_MS;
}

function encode(pos: Position): string {


  return `${pos.x},${pos.y}`;
}

function decode(value: string): Position | null {




  const [x, y] = value.split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x! < 0 || y! < 0) return null;
  return { x:x!, y:y! };
}

export async function setUserOnline(spaceId: string, userId: string, pos: Position) {




  await redis.send("ZADD", [onlineKey(spaceId), String(Date.now()), userId]);





  await redis.hmset(positionsKey(spaceId), [userId, encode(pos)]);
}

export async function setUserPosition(spaceId: string, userId: string, pos: Position) {



  await redis.hmset(positionsKey(spaceId), [userId, encode(pos)]);
}

export async function getUserPosition(spaceId: string, userId: string): Promise<Position | null> {




  const value = await redis.hmget(positionsKey(spaceId), [userId]);

  const raw = value?.[0];


  if (!raw) return null;


  return decode(raw);
}

export async function isUserOnline(spaceId: string, userId: string): Promise<boolean> {





  const renewedAt = await redis.send("ZSCORE", [onlineKey(spaceId), userId]);

  return renewedAt != null && Number(renewedAt) > leaseCutoff();
}

export async function getRoomUsers(spaceId: string): Promise<RoomUser[]> {


  const onlineIds = (await redis.send("ZRANGE", [
    onlineKey(spaceId), `(${leaseCutoff()}`, "+inf", "BYSCORE",
  ])) as string[] | null;

  if (!onlineIds || onlineIds.length === 0) return [];



  const positions = (await redis.hmget(positionsKey(spaceId), onlineIds)) as (string | null)[];

  const users: RoomUser[] = [];



  for (let i = 0; i < onlineIds.length; i++) {
    const userId = onlineIds[i];
    const rawPos = positions[i];

    if (!userId) continue;

    const pos = rawPos ? decode(rawPos) : null;
    if (!pos) continue;

    users.push({ userId, ...pos });
  }

  return users;
}

export async function removeUser(spaceId: string, userId: string) {





  await redis.send("ZREM", [onlineKey(spaceId), userId]);
}

// In one step, so nothing lands in between: renews the leases of the people given (those connected
// to this server) and ends the ones that ran out. Returns who had no lease or a run-out one
// before this (others may have been told they left) and whose lease ran out (they left).
const RENEW_LEASES = `
local key, now, cutoff = KEYS[1], ARGV[1], tonumber(ARGV[2])
local lapsed = {}
for i = 3, #ARGV do
  local renewedAt = redis.call('ZSCORE', key, ARGV[i])
  if not renewedAt or tonumber(renewedAt) <= cutoff then lapsed[#lapsed + 1] = ARGV[i] end
  redis.call('ZADD', key, now, ARGV[i])
end
local expired = redis.call('ZRANGE', key, '-inf', ARGV[2], 'BYSCORE')
if #expired > 0 then redis.call('ZREM', key, unpack(expired)) end
return { lapsed, expired }
`;

export async function renewLeases(spaceId: string, userIds: string[]) {
  const now = Date.now();
  const [lapsed, expired] = (await redis.send("EVAL", [
    RENEW_LEASES, "1", onlineKey(spaceId), String(now), String(now - PRESENCE_LEASE_MS), ...userIds,
  ])) as [string[], string[]];
  return { lapsed, expired };
}





function currentSpaceKey(userId: string): string {
  return `user:${userId}:currentSpace`;
}

export async function setCurrentSpace(userId: string, spaceId: string) {
  await redis.send("SET", [currentSpaceKey(userId), spaceId]);
}

export async function getCurrentSpace(userId: string): Promise<string | null> {
  const value = (await redis.send("GET", [currentSpaceKey(userId)])) as string | null;
  return value ?? null;
}

export async function clearCurrentSpace(userId: string) {
  await redis.send("DEL", [currentSpaceKey(userId)]);
}





export type AgentActivity = {
  text: string;
  state: "cooking" | "done";
  at: number;
  project?: string;
  branch?: string;
  commit?: string;
  /** "claude-code", "codex" or "cursor-agent"; missing from older hooks (Claude Code). */
  agent?: string;
};

function activityKey(spaceId: string): string {
  return `space:${spaceId}:activity`;
}

export async function setAgentActivity(spaceId: string, userId: string, activity: AgentActivity) {
  await redis.hmset(activityKey(spaceId), [userId, JSON.stringify(activity)]);
}

export async function clearAgentActivity(spaceId: string, userId: string) {
  await redis.send("HDEL", [activityKey(spaceId), userId]);
}

export async function getAgentActivities(spaceId: string): Promise<Record<string, AgentActivity>> {
  const values = (await redis.send("HGETALL", [activityKey(spaceId)])) as
    | Record<string, string>
    | null;
  const activities: Record<string, AgentActivity> = {};
  if (!values) return activities;

  for (const [userId, raw] of Object.entries(values)) {
    try {
      const parsed = JSON.parse(raw) as AgentActivity;
      if (parsed && typeof parsed.text === "string" && typeof parsed.at === "number") {
        activities[userId] = parsed;
      }
    } catch {

    }
  }

  return activities;
}
