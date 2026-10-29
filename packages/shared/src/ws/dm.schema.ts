import * as z from "zod";

// Private 1-on-1 chat: ask someone, they accept or decline, then messages flow between the two.
// It is end-to-end encrypted (dm-crypto.ts): the request and the accept carry each person's public
// key, and a message carries only its ciphertext. The server passes each of these to the one
// person it is for, so it knows who talks to whom and when, but never what they say.

// Longest message someone can type.
export const DM_TEXT_MAX_CHARS = 500;

const UserId = z.string().min(1).max(64);

const base64 = (length: { exact: number } | { min: number; max: number }) => {
  const text = z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, "Not base64");
  return "exact" in length ? text.length(length.exact) : text.min(length.min).max(length.max);
};

// The raw 65-byte P-256 public key, and the 12-byte AES-GCM IV.
export const DmPublicKey = base64({ exact: 88 });
const DmIv = base64({ exact: 16 });
// 16 bytes of tag plus up to 3 UTF-8 bytes for each character of the message.
const DmCiphertextText = base64({ min: 24, max: Math.ceil((DM_TEXT_MAX_CHARS * 3 + 16) / 3) * 4 });
// Counts up from 0 for each sender in a conversation, so a repeated message is noticed.
const DmSeq = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const DirectChatRequestMessage = z.object({
  type: z.literal("dm-request"),
  payload: z.object({ targetUserId: UserId, publicKey: DmPublicKey }),
});

export const DirectChatRequestBroadcast = z.object({
  type: z.literal("dm-request"),
  payload: z.object({ fromUserId: z.string(), publicKey: DmPublicKey, at: z.number() }),
});

// targetUserId is the person who asked. A yes carries the answerer's public key; a no carries none.
export const DirectChatResponseMessage = z.object({
  type: z.literal("dm-response"),
  payload: z.union([
    z.object({ targetUserId: UserId, accept: z.literal(true), publicKey: DmPublicKey }),
    z.object({ targetUserId: UserId, accept: z.literal(false) }),
  ]),
});

export const DirectChatResponseBroadcast = z.object({
  type: z.literal("dm-response"),
  payload: z.union([
    z.object({ fromUserId: z.string(), accept: z.literal(true), publicKey: DmPublicKey, at: z.number() }),
    z.object({ fromUserId: z.string(), accept: z.literal(false), at: z.number() }),
  ]),
});

export const DirectMessage = z.object({
  type: z.literal("dm"),
  payload: z.object({ targetUserId: UserId, seq: DmSeq, iv: DmIv, ciphertext: DmCiphertextText }),
});

export const DirectMessageBroadcast = z.object({
  type: z.literal("dm"),
  payload: z.object({ fromUserId: z.string(), seq: DmSeq, iv: DmIv, ciphertext: DmCiphertextText, at: z.number() }),
});

export type DirectChatRequestMessage = z.infer<typeof DirectChatRequestMessage>;
export type DirectChatRequestBroadcast = z.infer<typeof DirectChatRequestBroadcast>;
export type DirectChatResponseMessage = z.infer<typeof DirectChatResponseMessage>;
export type DirectChatResponseBroadcast = z.infer<typeof DirectChatResponseBroadcast>;
export type DirectMessage = z.infer<typeof DirectMessage>;
export type DirectMessageBroadcast = z.infer<typeof DirectMessageBroadcast>;
