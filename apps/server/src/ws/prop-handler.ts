import type { ClientMessage } from "@repo/shared";
import type { Socket } from "./room-manager";
import { broadcast, othersInRoom, propOf, setProp } from "./room-manager";
import { publishRoomEvent } from "./pubsub";

type PropPayload = Extract<ClientMessage, { type: "prop" }>["payload"];

function send(ws: Socket, message: unknown) {
  ws.send(JSON.stringify(message));
}

// Someone got on or off a bike, or picked up, sipped or dropped a drink. Each bike has one rider:
// asking for one that someone else here is riding gets your own current prop sent back instead.
// (Riders on another server aren't seen here, so two servers could share a bike for a moment.)
export async function handleProp(ws: Socket, { prop }: PropPayload) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }

  if (prop?.kind === "bike") {
    const taken = othersInRoom(spaceId, userId).some((member) => member.prop?.kind === "bike" && member.prop.bike === prop.bike);
    if (taken) return send(ws, { type: "prop", payload: { userId, prop: propOf(spaceId, userId) } });
  }

  setProp(spaceId, userId, prop);
  const message = { type: "prop", payload: { userId, prop } } as const;
  broadcast(spaceId, userId, message);
  await publishRoomEvent(spaceId, userId, message);
}
