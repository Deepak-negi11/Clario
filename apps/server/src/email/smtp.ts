import { createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { OutgoingEmail, SendResult } from "./resend";

// Keep a slow or silent mail server from holding the sender's request open
// (nodemailer's own defaults are 2 minutes to connect and 10 minutes of socket silence).
const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

// Read on every call, like the Resend config. SMTP is only used when SMTP_HOST is set.
export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT?.trim() || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[email] SMTP_PORT must be a port number, got "${process.env.SMTP_PORT}"`);
    return null;
  }

  const user = process.env.SMTP_USER?.trim() || undefined;
  const pass = process.env.SMTP_PASS || undefined;
  // Gmail and most providers only send as the account you log in with, so that is the default sender.
  const from = process.env.EMAIL_FROM?.trim() || (user?.includes("@") ? `Clario <${user}>` : "");
  if (!from) return null;

  // Port 465 speaks TLS from the first byte; other ports (usually 587) upgrade with STARTTLS.
  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureSetting ? secureSetting === "true" : port === 465;

  return { host, port, secure, user, pass, from };
}

export function smtpTransportOptions(config: SmtpConfig): SMTPTransport.Options {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Never send the password in the clear: without TLS from the start, insist on STARTTLS.
    // A mail catcher on this machine (Mailpit and the like) is the one exception.
    requireTLS: !config.secure && !LOCAL_HOSTS.has(config.host),
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  };
}

export async function sendWithSmtp(config: SmtpConfig, email: OutgoingEmail): Promise<SendResult> {
  const transporter = createTransport(smtpTransportOptions(config));
  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      replyTo: email.replyTo,
    });
    return { ok: true, id: info.messageId };
  } catch (error) {
    return {
      ok: false,
      reason: failureReason(error),
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    transporter.close();
  }
}

// A 5xx reply is a refusal that retrying won't fix (wrong password, unknown address, daily quota used up);
// a 4xx reply is temporary (throttling, greylisting). No reply at all means the server couldn't be reached.
function failureReason(error: unknown): Extract<SendResult, { ok: false }>["reason"] {
  const { code, responseCode } = (error ?? {}) as { code?: string; responseCode?: number };
  if (typeof responseCode === "number") return responseCode >= 500 ? "rejected" : "rate-limited";
  if (code === "EAUTH" || code === "EENVELOPE") return "rejected";
  return "unavailable";
}
