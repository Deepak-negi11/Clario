const RESEND_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

export type EmailConfig = {
  apiKey: string;
  from: string;
};

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: "rejected" | "rate-limited" | "unavailable"; detail: string };

// Read on every call (not at import) so a missing key gives a clear error instead of a crash,
// and setting the env var only needs a server restart.
export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendWithResend(config: EmailConfig, email: OutgoingEmail): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        reply_to: email.replyTo,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const body = (await response.json().catch(() => null)) as
    | { id?: string; name?: string; message?: string }
    | null;

  if (response.ok) return { ok: true, id: body?.id ?? "" };

  const detail = [response.status, body?.name, body?.message].filter(Boolean).join(" ");
  if (response.status === 429) return { ok: false, reason: "rate-limited", detail };
  if (response.status >= 500) return { ok: false, reason: "unavailable", detail };
  return { ok: false, reason: "rejected", detail };
}
