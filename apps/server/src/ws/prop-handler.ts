import type { ClientMessage } from "@repo/shared";
import type { Socket } from "./room-manager";
import { bikeTaken, broadcast, isCurrentSocket, propOf, setProp } from "./room-manager";
import { publishRoomEvent } from "./pubsub";

type PropPayload = Extract<ClientMessage, { type: "prop" }>["payload"];

function send(ws: Socket, message: unknown) {
  ws.send(JSON.stringify(message));
}

// Someone got on or off a bike, or picked up, sipped or dropped a drink. Each bike has one rider,
// here or on another server: asking for one someone else rides gets your own prop sent back.
export async function handleProp(ws: Socket, { prop }: PropPayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }
  // A tab that another tab (or a reconnect) replaced no longer speaks for this person.
  if (!isCurrentSocket(spaceId, userId, ws)) return;

  if (prop?.kind === "bike" && bikeTaken(spaceId, prop.bike, userId)) {
    return send(ws, { type: "prop", payload: { userId, prop: propOf(spaceId, userId) } });
  }

  setProp(spaceId, userId, prop);
  const message = { type: "prop", payload: { userId, prop } } as const;
  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);
}
