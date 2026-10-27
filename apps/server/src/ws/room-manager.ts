import type { ServerWebSocket } from "bun";














type Member = {
  socket: Socket;
  userId: string;
  x: number;
  y: number;
};










const rooms = new Map<string, Map<string, Member>>();

export type SocketData = {
  userId?: string;
  spaceId?: string;
  x: number;
  y: number;
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


export function sendToUser(spaceId:string , userId:string,message:unknown){
  const member = rooms.get(spaceId)?.get(userId)
  if(member) member.socket.send(JSON.stringify(message))
}
