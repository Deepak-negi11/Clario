import { redis } from "./redis";

export type Position = { x: number; y: number };
export type RoomUser = { userId: string } & Position;








function positionsKey(spaceId: string): string {
  return `space:${spaceId}:positions`;
}




function onlineKey(spaceId: string): string {
  return `space:${spaceId}:online`;
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




  await redis.send("SADD", [onlineKey(spaceId), userId]);





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





  const isMember = await redis.send("SISMEMBER", [onlineKey(spaceId), userId]);

  return isMember === 1;
}

export async function getRoomUsers(spaceId: string): Promise<RoomUser[]> {


  const onlineIds = (await redis.send("SMEMBERS", [onlineKey(spaceId)])) as string[] | null;

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





  await redis.send("SREM", [onlineKey(spaceId), userId]);
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





export type AgentActivity = { text: string; state: "cooking" | "done"; at: number };

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
