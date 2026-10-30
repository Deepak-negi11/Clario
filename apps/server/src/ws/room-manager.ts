import type { ServerWebSocket } from "bun";
import type { Bike, PlayerProp } from "@repo/shared";














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


// Props of people connected to other servers, as those servers announced them (pubsub.ts), so
// people joining here see them too and a bike ridden there isn't handed out here.
const remoteProps = new Map<string, Map<string, PlayerProp>>();

export function setRemoteProp(spaceId: string, userId: string, prop: PlayerProp | null) {
  let space = remoteProps.get(spaceId);
  if (!prop) {
    space?.delete(userId);
    return;
  }
  if (!space) remoteProps.set(spaceId, (space = new Map()));
  space.set(userId, prop);
}

export function forgetRemoteProps(spaceId: string) {
  remoteProps.delete(spaceId);
}

// Someone's bike or drink, whichever server they are on.
export function propOf(spaceId: string, userId: string): PlayerProp | null {
  return rooms.get(spaceId)?.get(userId)?.prop ?? remoteProps.get(spaceId)?.get(userId) ?? null;
}

export function setProp(spaceId: string, userId: string, prop: PlayerProp | null) {
  const member = rooms.get(spaceId)?.get(userId);
  if (member) member.prop = prop;
}

// Whether anyone but `exceptUserId`, here or on another server, is riding this bike.
export function bikeTaken(spaceId: string, bike: Bike, exceptUserId: string) {
  const rides = (prop: PlayerProp | null | undefined) => prop?.kind === "bike" && prop.bike === bike;
  if (othersInRoom(spaceId, exceptUserId).some((member) => rides(member.prop))) return true;
  for (const [userId, prop] of remoteProps.get(spaceId) ?? []) if (userId !== exceptUserId && rides(prop)) return true;
  return false;
}

export function isInRoom(spaceId: string, userId: string) {
  return rooms.get(spaceId)?.has(userId) ?? false;
}

// Whether this socket is still the one a person is in the space with (a second tab or a
// reconnect replaces it, and a closed one is gone).
export function isCurrentSocket(spaceId: string, userId: string, socket: Socket) {
  return rooms.get(spaceId)?.get(userId)?.socket === socket;
}


export function sendToUser(spaceId:string , userId:string,message:unknown){
  const member = rooms.get(spaceId)?.get(userId)
  if(member) member.socket.send(JSON.stringify(message))
}
