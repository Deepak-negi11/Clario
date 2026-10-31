// Server only. What every provider's chat call takes, and the error it throws on an HTTP failure.

import type { AiProvider } from "@repo/shared";

export type AiCall = { system: string; user: string; maxTokens: number; json: boolean; signal: AbortSignal };

/** A provider's HTTP error, so the route can say "your key was rejected" instead of failing quietly. */
export class AiHttpError extends Error {
  constructor(readonly provider: AiProvider, readonly status: number) {
    super(`${provider} returned HTTP ${status}`);
  }
}
