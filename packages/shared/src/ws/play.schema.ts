import * as z from "zod";

// Playing the Game Room games with other people in the space (a host and up to three guests at a
// table), and the Lounge TV that everyone in the space watches together. The server checks who may
// talk to whom and relays the rest.

export const PlayGame = z.enum(["pong", "breakout", "snake", "sumo"]);

// Largest game message the server relays (a snapshot of the board), in JSON characters.
export const PLAY_DATA_MAX_CHARS = 12_000;

const UserId = z.string().min(1).max(64);

// Ask someone to play a game with you.
export const PlayInviteMessage = z.object({
  type: z.literal("play-invite"),
  payload: z.object({ targetUserId: UserId, game: PlayGame }),
});

export const PlayInviteBroadcast = z.object({
  type: z.literal("play-invite"),
  payload: z.object({ fromUserId: z.string(), game: PlayGame, at: z.number() }),
});

// targetUserId is the person who asked.
export const PlayAnswerMessage = z.object({
  type: z.literal("play-answer"),
  payload: z.object({ targetUserId: UserId, accept: z.boolean() }),
});

export const PlayAnswerBroadcast = z.object({
  type: z.literal("play-answer"),
  payload: z.object({ fromUserId: z.string(), accept: z.boolean(), game: PlayGame.optional(), at: z.number() }),
});

// Take back an invite, or leave a game in progress.
export const PlayLeaveMessage = z.object({
  type: z.literal("play-leave"),
  payload: z.object({ targetUserId: UserId }),
});

export const PlayLeaveBroadcast = z.object({
  type: z.literal("play-leave"),
  payload: z.object({ fromUserId: z.string(), at: z.number() }),
});

// Game traffic between the two players (board snapshots one way, keys the other). The server
// only checks the size and that the two are playing together.
const PlayData = z.unknown().refine((value) => {
  try {
    const text = JSON.stringify(value);
    return text !== undefined && text.length <= PLAY_DATA_MAX_CHARS;
  } catch {
    return false;
  }
}, "Game message too large");

export const PlayDataMessage = z.object({
  type: z.literal("play-data"),
  payload: z.object({ targetUserId: UserId, data: PlayData }),
});

export const PlayDataBroadcast = z.object({
  type: z.literal("play-data"),
  payload: z.object({ fromUserId: z.string(), data: z.unknown() }),
});

// The Lounge TV: one per space, the same YouTube video for everyone. "sync" asks for what's on.
const YouTubeVideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

export const TvMessage = z.object({
  type: z.literal("tv"),
  payload: z.discriminatedUnion("action", [
    z.object({ action: z.literal("play"), videoId: YouTubeVideoId, start: z.number().int().min(0).max(86_400).default(0) }),
    z.object({ action: z.literal("stop") }),
    z.object({ action: z.literal("sync") }),
  ]),
});

// position: seconds into the video when the server sent this.
export const TvState = z.object({ videoId: YouTubeVideoId, position: z.number().min(0), byUserId: z.string() });

export const TvBroadcast = z.object({
  type: z.literal("tv"),
  payload: z.object({ state: TvState.nullable(), at: z.number() }),
});

export const PlayClientMessage = z.discriminatedUnion("type", [
  PlayInviteMessage,
  PlayAnswerMessage,
  PlayLeaveMessage,
  PlayDataMessage,
  TvMessage,
]);

export const PlayServerMessage = z.discriminatedUnion("type", [
  PlayInviteBroadcast,
  PlayAnswerBroadcast,
  PlayLeaveBroadcast,
  PlayDataBroadcast,
  TvBroadcast,
]);

export type PlayGame = z.infer<typeof PlayGame>;
export type TvState = z.infer<typeof TvState>;
export type PlayClientMessage = z.input<typeof PlayClientMessage>;
export type PlayServerMessage = z.infer<typeof PlayServerMessage>;
