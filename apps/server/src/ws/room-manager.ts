import type { ServerWebSocket } from "bun";
import type { PlayerProp } from "@repo/shared";














type Member = {
  socket: Socket;
  userId: string;
  x: number;
  y: number;
  // A bike they're riding or a drink in their hand (prop.schema.ts in @repo/shared).
  prop?: PlayerProp | null;
};










const rooms = new Map<string, Map<string, Member>>();

export type SocketData = {
  userId?: string;
  spaceId?: string;
  x: number;
  y: number;
  // The player's last step still being handled; the next one waits for it (ws-handler.ts).
  moves?: Promise<unknown>;
};



export type Socket = ServerWebSocket<SocketData>;



export function addToRoom(spaceId: string, member: Member) {


  let room = rooms.get(spaceId);

  if (!room) {
    room = new Map();
    rooms.set(spaceId, room);
  }

  room.set(member.userId, member);
}



export function removeFromRoom(spaceId: string, userId: string, socket?: Socket) {
  const room = rooms.get(spaceId);
  if (!room) return false;

  const member = room.get(userId);
  if (!member || (socket && member.socket !== socket)) return false;

  room.delete(userId);

  if (room.size === 0) {
    rooms.delete(spaceId);
  }

  return true;
}


export function roomSize(spaceId: string) {
  return rooms.get(spaceId)?.size ?? 0;
}



export function othersInRoom(spaceId: string, exceptUserId: string): Member[] {
  const room = rooms.get(spaceId);
  if (!room) return [];

  return [...room.values()].filter((member) => member.userId !== exceptUserId);
}


export function broadcast(spaceId: string, exceptUserId: string, message: unknown) {
  broadcastWhere(spaceId, exceptUserId, message, () => true);
}




export function broadcastWhere(
  spaceId: string,
  exceptUserId: string,
  message: unknown,
  predicate: (member: Omit<Member, "socket">) => boolean,
) {
  const data = JSON.stringify(message);
  for (const member of othersInRoom(spaceId, exceptUserId)) {
    if (predicate(member)) member.socket.send(data);
  }
}



export function updatePosition(spaceId: string, userId: string, x: number, y: number) {
  const member = rooms.get(spaceId)?.get(userId);

  if (member) {
    member.x = x;
    member.y = y;
  }
}


export function propOf(spaceId: string, userId: string): PlayerProp | null {
  return rooms.get(spaceId)?.get(userId)?.prop ?? null;
}

export function setProp(spaceId: string, userId: string, prop: PlayerProp | null) {
  const member = rooms.get(spaceId)?.get(userId);
  if (member) member.prop = prop;
}

export function isInRoom(spaceId: string, userId: string) {
  return rooms.get(spaceId)?.has(userId) ?? false;
}


export function sendToUser(spaceId:string , userId:string,message:unknown){
  const member = rooms.get(spaceId)?.get(userId)
  if(member) member.socket.send(JSON.stringify(message))
}
