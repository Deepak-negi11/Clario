import prisma from "@repo/db";
import { requireAuth } from "../middleware/auth";
import { jsonMessage } from "../utils/http";
import { isUserOnline } from "../ws/presence";
import { redis } from "../ws/redis";
import { getEmailConfig, sendWithResend, type OutgoingEmail, type SendResult } from "./resend";
import { getSmtpConfig, sendWithSmtp } from "./smtp";

export const MAX_SUBJECT_LENGTH = 150;
export const MAX_BODY_LENGTH = 5000;
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 10 * 60;

type SendEmailBody = {
  recipientId?: unknown;
  subject?: unknown;
  body?: unknown;
};

export type EmailInput = {
  recipientId: string;
  subject: string;
  body: string;
};

const FAILURE_MESSAGES: Record<Extract<SendResult, { ok: false }>["reason"], string> = {
  rejected: "The email service rejected this message. Try again later.",
  "rate-limited": "The email service is busy. Try again in a minute.",
  unavailable: "Could not reach the email service. Try again.",
};

export function parseEmailInput(value: unknown): EmailInput | string {
  const raw = typeof value === "object" ? (value as SendEmailBody | null) : null;
  if (
    !raw ||
    typeof raw.recipientId !== "string" ||
    typeof raw.subject !== "string" ||
    typeof raw.body !== "string"
  ) {
    return "recipientId, subject and body are required";
  }

  const recipientId = raw.recipientId.trim();
  // Collapse line breaks so the subject stays one header line.
  const subject = raw.subject.replace(/\s+/g, " ").trim();
  const body = raw.body.replace(/\r\n/g, "\n").trim();

  if (!recipientId) return "Choose who to send this to";
  if (!subject) return "Subject can't be empty";
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer`;
  }
  if (!body) return "Message can't be empty";
  if (body.length > MAX_BODY_LENGTH) {
    return `Message must be ${MAX_BODY_LENGTH} characters or fewer`;
  }

  return { recipientId, subject, body };
}

// SMTP wins when SMTP_HOST is set; otherwise Resend, when its API key is set.
function getEmailSender(): ((email: OutgoingEmail) => Promise<SendResult>) | null {
  const smtp = getSmtpConfig();
  if (smtp) return (email) => sendWithSmtp(smtp, email);
  const resend = getEmailConfig();
  if (resend) return (email) => sendWithResend(resend, email);
  return null;
}

// Fixed window per sender, kept in Redis so the limit holds across restarts and server instances.
async function takeSendSlot(userId: string): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const key = `email:sent:${userId}`;
  const count = Number(await redis.send("INCR", [key]));
  if (count === 1) await redis.send("EXPIRE", [key, String(RATE_WINDOW_SECONDS)]);
  if (count <= RATE_LIMIT) return { allowed: true };

  const ttl = Number(await redis.send("TTL", [key]));
  if (ttl < 0) {
    // The key lost its expiry (e.g. a crash between INCR and EXPIRE); restore it so nobody is blocked forever.
    await redis.send("EXPIRE", [key, String(RATE_WINDOW_SECONDS)]);
    return { allowed: false, retryAfterSeconds: RATE_WINDOW_SECONDS };
  }
  return { allowed: false, retryAfterSeconds: ttl };
}

export async function handleSendEmail(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const send = getEmailSender();
  if (!send) {
    return jsonMessage("Email is not configured on this server yet.", 503);
  }

  const parts = new URL(req.url).pathname.split("/");
  const spaceId = parts[parts.length - 2] ?? "";

  const input = parseEmailInput(await req.json().catch(() => null));
  if (typeof input === "string") return jsonMessage(input);

  // Both people must be in the space right now, so the app's email account
  // can only reach people the sender is actually with, never arbitrary addresses.
  if (!(await isUserOnline(spaceId, auth.userId))) {
    return jsonMessage("Join this space before sending email.", 403);
  }
  if (input.recipientId !== auth.userId && !(await isUserOnline(spaceId, input.recipientId))) {
    return jsonMessage("That person has left the space.", 404);
  }

  const [space, sender, recipient] = await Promise.all([
    prisma.space.findUnique({ where: { id: spaceId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: auth.userId }, select: { username: true, email: true } }),
    prisma.user.findUnique({ where: { id: input.recipientId }, select: { email: true } }),
  ]);
  if (!space) return jsonMessage("Space not found", 404);
  if (!sender || !recipient) return jsonMessage("That person has left the space.", 404);

  const slot = await takeSendSlot(auth.userId);
  if (!slot.allowed) {
    const minutes = Math.ceil(slot.retryAfterSeconds / 60);
    return Response.json(
      { message: `You've reached the email limit. Try again in ${minutes} min.` },
      { status: 429, headers: { "Retry-After": String(slot.retryAfterSeconds) } },
    );
  }

  const result = await send({
    to: recipient.email,
    subject: input.subject,
    text: `${input.body}\n\n-- \nSent by ${sender.username} from the "${space.name}" space on Clario. Reply to this email to answer them directly.`,
    replyTo: sender.email,
  });

  if (!result.ok) {
    console.error(`[email] send failed (${result.reason}): ${result.detail}`);
    return jsonMessage(FAILURE_MESSAGES[result.reason], result.reason === "rejected" ? 502 : 503);
  }

  return Response.json({ id: result.id });
}
