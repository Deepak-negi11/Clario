










import prisma from "@repo/db";
import { ClientMessage, getChatRoomAtPosition, getMapTemplate } from "@repo/shared";
import { getUserIdFromToken } from "../middleware/auth";
import type { Socket, SocketData } from "./room-manager";
import {
  addToRoom,
  broadcast,
  broadcastWhere,
  removeFromRoom,
  roomSize,
  updatePosition,
} from "./room-manager";
import {
  clearAgentActivity,
  clearCurrentSpace,
  getAgentActivities,
  getRoomUsers,
  removeUser,
  setCurrentSpace,
  setUserOnline,
  setUserPosition,
  getUserPosition,
} from "./presence";
import {
  publishRoomEvent,
  subscribeToSpaceEvents,
  unsubscribeFromSpaceEvents,
} from "./pubsub";

import { isInRoom, sendToUser } from "./room-manager";
import {
  answerDirectChat,
  canDirectMessage,
  forgetDirectChats,
  requestDirectChat,
} from "./direct-chat";

type JoinPayload = Extract<ClientMessage, { type: "join" }>["payload"];
type MovePayload = Extract<ClientMessage, { type: "move" }>["payload"];
type ChatPayload = Extract<ClientMessage, { type: "chat" }>["payload"];
type ReactionPayload = Extract<ClientMessage, { type: "reaction" }>["payload"];
type LookPayload = Extract<ClientMessage, { type: "look" }>["payload"];
type SignalPayload = Extract<ClientMessage, { type: "webrtc-signal" }>["payload"];
type DirectRequestPayload = Extract<ClientMessage, { type: "dm-request" }>["payload"];
type DirectResponsePayload = Extract<ClientMessage, { type: "dm-response" }>["payload"];
type DirectMessagePayload = Extract<ClientMessage, { type: "dm" }>["payload"];


export function makeSocketData(): SocketData {
  return { x: 0, y: 0 };
}


function send(ws: Socket, message: unknown) {
  ws.send(JSON.stringify(message));
}


function isOneTileMove(from: { x: number; y: number }, to: MovePayload) {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) === 1;
}

export async function onMessage(ws: Socket, raw: string | Buffer) {
  let json: unknown;

  try {
    json = JSON.parse(raw.toString());
  } catch {
    return send(ws, { type: "error", message: "Invalid JSON" });
  }

  const parsed = ClientMessage.safeParse(json);
  if (!parsed.success) {
    return send(ws, { type: "error", message: "Invalid message" });
  }

  switch (parsed.data.type) {
    case "join":
      return handleJoin(ws, parsed.data.payload);
    case "move":
      return handleMove(ws, parsed.data.payload);
    case "chat":
      return handleChat(ws, parsed.data.payload);
    case "reaction":
      return handleReaction(ws, parsed.data.payload);
    case "look":
      return handleLook(ws, parsed.data.payload);
    case "webrtc-signal":
      return handleSignal(ws, parsed.data.payload)
    case "dm-request":
      return handleDirectRequest(ws, parsed.data.payload);
    case "dm-response":
      return handleDirectResponse(ws, parsed.data.payload);
    case "dm":
      return handleDirectMessage(ws, parsed.data.payload);
  }
}


async function handleJoin(ws: Socket, payload: JoinPayload) {
  if (ws.data.userId || ws.data.spaceId) {
    return send(ws, { type: "error", message: "Already joined a space" });
  }

  const userId = getUserIdFromToken(payload.token);
  if (!userId) {
    return send(ws, { type: "error", message: "Invalid token" });
  }

  const space = await prisma.space.findUnique({
    where: { id: payload.spaceId },
  });

  if (!space) {
    return send(ws, { type: "error", message: "Space not found" });
  }

  const template = getMapTemplate(space.mapTemplate);
  const lastPos = await getUserPosition(payload.spaceId, userId);
  const isRememberedPositionValid = lastPos
    && lastPos.x >= 0
    && lastPos.y >= 0
    && lastPos.x < template.dimensions.width
    && lastPos.y < template.dimensions.height;
  const spawn = isRememberedPositionValid ? lastPos : template.spawn;

  ws.data.userId = userId;
  ws.data.spaceId = payload.spaceId;
  ws.data.x = spawn.x;
  ws.data.y = spawn.y;


  await setUserOnline(payload.spaceId, userId, spawn);
  await setCurrentSpace(userId, payload.spaceId);

  const roomUsers = await getRoomUsers(payload.spaceId);
  const agentActivities = await getAgentActivities(payload.spaceId);

  const existingUsers = roomUsers




    .filter((user) => user.userId !== userId)
    .map((user) => ({
      id: user.userId,
      x: user.x,
      y: user.y,
    }));

  addToRoom(payload.spaceId, {
    socket: ws,
    userId,
    x: spawn.x,
    y: spawn.y,
  });
  await subscribeToSpaceEvents(payload.spaceId);


  send(ws, {
    type: "space-joined",
    payload: {
      userId,
      spawn,
      users: existingUsers,
      agentActivities: Object.keys(agentActivities).length > 0 ? agentActivities : undefined,
    },
  });

  const message = {
    type: "user-join",
    payload: { userId, x: spawn.x, y: spawn.y },
  } as const;

  broadcast(payload.spaceId, userId, message);
  await publishRoomEvent(payload.spaceId, userId, message);
}


async function handleMove(ws: Socket, payload: MovePayload) {
  const { spaceId, userId, x: currentX, y: currentY } = ws.data;

  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }

  const currentPosition = { x: currentX, y: currentY };
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  const template = getMapTemplate(space?.mapTemplate);
  const isInBounds = payload.x >= 0
    && payload.y >= 0
    && payload.x < template.dimensions.width
    && payload.y < template.dimensions.height;
  if (!isInBounds || !isOneTileMove(currentPosition, payload)) {
    return send(ws, {
      type: "movement-rejected",
      payload: currentPosition,
    });
  }

  ws.data.x = payload.x;
  ws.data.y = payload.y;
  updatePosition(spaceId, userId, payload.x, payload.y);

  await setUserPosition(spaceId, userId, {
    x: payload.x,
    y: payload.y,
  });

  const message = {
    type: "movement",
    payload: { userId, x: payload.x, y: payload.y },
  } as const;

  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);
}


async function handleSignal(ws:Socket , payload:SignalPayload){
  const {spaceId , userId} = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }
  if (payload.targetUserId === userId) return;

  sendToUser(spaceId, payload.targetUserId,{
    type:"webrtc-signal",
    payload:{fromUserId:userId , signal:payload.signal},
  })

}


// Like webrtc signals, these go to sockets on this server only.
function handleDirectRequest(ws: Socket, payload: DirectRequestPayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }
  const targetId = payload.targetUserId;
  if (targetId === userId) return;
  if (!isInRoom(spaceId, targetId)) {
    return send(ws, { type: "error", message: "That person is no longer in this space" });
  }

  const result = requestDirectChat(spaceId, userId, targetId);
  if (result === "sent") {
    sendToUser(spaceId, targetId, {
      type: "dm-request",
      payload: { fromUserId: userId, at: Date.now() },
    });
  } else if (result === "already-open" || result === "declined-recently") {
    // Nothing to ask: tell the asker where things stand, as if the other person answered again.
    send(ws, {
      type: "dm-response",
      payload: { fromUserId: targetId, accept: result === "already-open", at: Date.now() },
    });
  }
}


function handleDirectResponse(ws: Socket, payload: DirectResponsePayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }
  const requesterId = payload.targetUserId;
  if (!answerDirectChat(spaceId, userId, requesterId, payload.accept)) {
    return send(ws, { type: "error", message: "That chat request is no longer open" });
  }
  sendToUser(spaceId, requesterId, {
    type: "dm-response",
    payload: { fromUserId: userId, accept: payload.accept, at: Date.now() },
  });
}


function handleDirectMessage(ws: Socket, payload: DirectMessagePayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }
  const text = payload.text.trim().slice(0, 500);
  if (!text) return;
  if (!canDirectMessage(spaceId, userId, payload.targetUserId)) {
    return send(ws, { type: "error", message: "Ask to chat first" });
  }
  sendToUser(spaceId, payload.targetUserId, {
    type: "dm",
    payload: { fromUserId: userId, text, at: Date.now() },
  });
}


async function handleChat(ws: Socket, payload: ChatPayload) {
  const { spaceId, userId, x, y } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }

  const text = payload.text.trim().slice(0, 500);
  if (!text) return;

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { mapTemplate: true },
  });
  if (!space) return send(ws, { type: "error", message: "Space not found" });

  const room = payload.scope === "room"
    ? getChatRoomAtPosition(space.mapTemplate, { x, y })
    : null;
  if (payload.scope === "room" && !room) {
    return send(ws, { type: "error", message: "Enter a room to use room chat" });
  }

  const saved = await prisma.chatMessage.create({
    data: {
      spaceId,
      userId,
      text,
      scope: payload.scope === "room" ? "Room" : "General",
      roomId: room?.id,
    },
  });

  const message = {
    type: "chat",
    payload: {
      userId,
      text,
      at: saved.createdAt.getTime(),
      scope: payload.scope,
      roomId: room?.id,
      roomName: room?.name,
    },
  } as const;

  if (room) {
    broadcastWhere(spaceId, userId, message, (member) => (
      getChatRoomAtPosition(space.mapTemplate, member)?.id === room.id
    ));
    await publishRoomEvent(spaceId, userId, message, {
      mapTemplate: space.mapTemplate,
      roomId: room.id,
    });
  } else {
    broadcast(spaceId, userId, message);
    await publishRoomEvent(spaceId, userId, message);
  }
}


async function handleReaction(ws: Socket, payload: ReactionPayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }

  const emoji = payload.emoji.slice(0, 8);
  if (!emoji) return;

  const message = {
    type: "reaction",
    payload: { userId, emoji, at: Date.now() },
  } as const;

  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);
}


// The look is already validated by the schema and saved through the profile API;
// this only tells the rest of the space to redraw the sender.
async function handleLook(ws: Socket, look: LookPayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }

  const message = { type: "look", payload: { userId, look } } as const;
  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);
}


export async function onClose(ws: Socket) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) return;

  const removed = removeFromRoom(spaceId, userId, ws);
  if (!removed) return;

  forgetDirectChats(spaceId, userId);
  await removeUser(spaceId, userId);
  await clearCurrentSpace(userId);
  await clearAgentActivity(spaceId, userId);

  const message = {
    type: "user-left",
    payload: { userId },
  } as const;

  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);

  if (roomSize(spaceId) === 0) {
    await unsubscribeFromSpaceEvents(spaceId);
  }
}
