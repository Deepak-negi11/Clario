import * as z from "zod";

// The notice board: announcements and polls that people in a space post for each other. Text is
// cleaned here (one-line titles, no control or direction-override characters) and always shown as
// plain text. The server keeps the posts and votes, and sends each change to everyone in the space.

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 500;
export const POLL_OPTION_MAX = 60;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 5;
// Most posts the board shows (pinned ones first, then the newest).
export const NOTICE_LIST_MAX = 50;
// A poll's closing time must be at least this far ahead, and at most this far.
export const POLL_CLOSE_MIN_MS = 60 * 1000;
export const POLL_CLOSE_MAX_MS = 30 * 24 * 60 * 60 * 1000;

// Control characters and the invisible marks that flip text direction (they can make a post read
// differently from what it says).
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

export function cleanLine(text: string) {
  return text.replace(/\s+/g, " ").replace(HIDDEN, "").trim();
}

// Keeps line breaks, at most one empty line in a row.
export function cleanBody(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(HIDDEN, "")
    .replace(/[  ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const line = (max: number) => z.string().max(max * 4).transform(cleanLine).pipe(z.string().min(1, "Can't be empty").max(max));
const body = z.string().max(NOTICE_BODY_MAX * 4).transform(cleanBody).pipe(z.string().max(NOTICE_BODY_MAX));

const PostId = z.string().min(1).max(64);

export const PollOptions = z
  .array(line(POLL_OPTION_MAX))
  .min(POLL_OPTIONS_MIN)
  .max(POLL_OPTIONS_MAX)
  .refine((options) => new Set(options.map((option) => option.toLowerCase())).size === options.length, "Each option must be different");

// list: send me the board. announce / poll: post one. edit: change your own post's text, pin or
// (polls) closing time; a poll's options stay as they are once posted. delete: remove your own post.
// vote: pick an option in a poll (picking again changes your vote; one vote per person).
export const NoticeMessage = z.object({
  type: z.literal("notice"),
  payload: z.discriminatedUnion("action", [
    z.object({ action: z.literal("list") }),
    z.object({ action: z.literal("announce"), title: line(NOTICE_TITLE_MAX), body, pinned: z.boolean().default(false) }),
    z.object({
      action: z.literal("poll"),
      title: line(NOTICE_TITLE_MAX),
      body: body.default(""),
      options: PollOptions,
      closesAt: z.number().int().nullable().default(null),
      pinned: z.boolean().default(false),
    }),
    z.object({
      action: z.literal("edit"),
      postId: PostId,
      title: line(NOTICE_TITLE_MAX),
      body,
      pinned: z.boolean(),
      closesAt: z.number().int().nullable().optional(),
    }),
    z.object({ action: z.literal("delete"), postId: PostId }),
    z.object({ action: z.literal("vote"), postId: PostId, option: z.number().int().min(0).max(POLL_OPTIONS_MAX - 1) }),
  ]),
});

export const NoticeKind = z.enum(["announcement", "poll"]);

export const NoticePostSchema = z.object({
  id: z.string().max(64),
  kind: NoticeKind,
  authorId: z.string().max(64),
  authorName: z.string().max(64),
  title: z.string().max(NOTICE_TITLE_MAX),
  body: z.string().max(NOTICE_BODY_MAX),
  pinned: z.boolean(),
  // Polls only (empty for announcements): the options, and how many votes each has.
  options: z.array(z.string().max(POLL_OPTION_MAX)).max(POLL_OPTIONS_MAX),
  votes: z.array(z.number().int().nonnegative()).max(POLL_OPTIONS_MAX),
  closesAt: z.number().nullable(),
  createdAt: z.number(),
  editedAt: z.number().nullable(),
});
export type NoticePost = z.infer<typeof NoticePostSchema>;

// list: the board, and which option you picked in each poll you voted in. saved: a post is new or
// changed (its text, pin or vote counts). removed: its author deleted it. voted: your vote counted
// (only you hear this; nobody sees who voted for what). refused: why your post, edit or vote didn't go.
export const NoticeBroadcast = z.object({
  type: z.literal("notice"),
  payload: z.discriminatedUnion("event", [
    z.object({
      event: z.literal("list"),
      posts: z.array(NoticePostSchema).max(NOTICE_LIST_MAX),
      myVotes: z.record(z.string(), z.number().int().nonnegative()),
    }),
    z.object({ event: z.literal("saved"), post: NoticePostSchema }),
    z.object({ event: z.literal("removed"), postId: z.string().max(64) }),
    z.object({ event: z.literal("voted"), postId: z.string().max(64), option: z.number().int().nonnegative() }),
    z.object({ event: z.literal("refused"), reason: z.string().max(200) }),
  ]),
});

export type NoticeMessage = z.infer<typeof NoticeMessage>;
export type NoticeMessageInput = z.input<typeof NoticeMessage>;
export type NoticeBroadcast = z.infer<typeof NoticeBroadcast>;
