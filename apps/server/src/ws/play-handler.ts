import type { ClientMessage } from "@repo/shared";
import type { Socket } from "./room-manager";
import { broadcast, isInRoom, sendToUser } from "./room-manager";
import { allowPlayMessage, answerPlay, arePlaying, forgetPlay, invitePlay, leavePlay, setTv, tvState } from "./play";

// Messages for Game Room play and the Lounge TV (rules in play.ts).
export type PlayMessage = Extract<ClientMessage, { type: "play-invite" | "play-answer" | "play-leave" | "play-data" | "tv" }>;

function send(ws: Socket, message: unknown) {
  ws.send(JSON.stringify(message));
}

const left = (fromUserId: string) => ({ type: "play-leave", payload: { fromUserId, at: Date.now() } }) as const;

export function handlePlay(ws: Socket, message: PlayMessage) {
  const { spaceId, userId } = ws.data;
  if (!spaceId || !userId) {
    return send(ws, { type: "error", message: "Join a space first" });
  }

  switch (message.type) {
    case "play-invite": {
      const { targetUserId, game } = message.payload;
      if (targetUserId === userId) return;
      if (!isInRoom(spaceId, targetUserId)) {
        return send(ws, { type: "error", message: "That person is no longer in this space" });
      }
      const result = invitePlay(spaceId, userId, targetUserId, game);
      for (const id of result.notify) sendToUser(spaceId, id, left(userId));
      if (!result.ok) return send(ws, { type: "error", message: "Your table is full" });
      return sendToUser(spaceId, targetUserId, { type: "play-invite", payload: { fromUserId: userId, game, at: Date.now() } });
    }

    case "play-answer": {
      const hostId = message.payload.targetUserId;
      const result = answerPlay(spaceId, userId, hostId, message.payload.accept);
      // The invite was taken back, ran out, or the table filled: tell the person answering it's over.
      if (result === false) return send(ws, left(hostId));
      if (result) for (const id of result.notify) sendToUser(spaceId, id, left(userId));
      return sendToUser(spaceId, hostId, {
        type: "play-answer",
        payload: { fromUserId: userId, accept: result !== null, ...(result ? { game: result.game } : {}), at: Date.now() },
      });
    }

    case "play-leave": {
      const otherUserId = message.payload.targetUserId;
      if (leavePlay(spaceId, userId, otherUserId)) sendToUser(spaceId, otherUserId, left(userId));
      return;
    }

    case "play-data": {
      const otherUserId = message.payload.targetUserId;
      // Not at the same table, or over the per-second budget: drop it quietly (the next frame follows).
      if (!arePlaying(spaceId, userId, otherUserId) || !allowPlayMessage(userId, otherUserId)) return;
      return sendToUser(spaceId, otherUserId, { type: "play-data", payload: { fromUserId: userId, data: message.payload.data } });
    }

    case "tv": {
      const request = message.payload;
      const now = () => ({ type: "tv", payload: { state: tvState(spaceId), at: Date.now() } }) as const;
      if (request.action === "sync") return send(ws, now());
      const changed = setTv(spaceId, userId, request.action === "play" ? { videoId: request.videoId, start: request.start } : null);
      // Too soon to change it again: just put this person back in step with everyone.
      if (!changed) return send(ws, now());
      const update = now();
      send(ws, update);
      broadcast(spaceId, userId, update);
      return;
    }
  }
}

// Someone left the space: end their invites and tables and tell the people they were playing with.
export function forgetPlayer(spaceId: string, userId: string) {
  for (const id of forgetPlay(spaceId, userId)) sendToUser(spaceId, id, left(userId));
}
