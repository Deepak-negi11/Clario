// Server only. In-memory limit on AI calls per visitor: 20 a minute, 200 a day.
// Resets when the server restarts and is not shared between servers, which is fine for
// the hackathon. Over the limit the route answers from saved tips instead of the AI.

const PER_MINUTE = 20;
const PER_DAY = 200;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const calls = new Map<string, number[]>();

export function takeAiCall(visitor: string, now = Date.now()): boolean {
  const recent = (calls.get(visitor) ?? []).filter((at) => now - at < DAY);
  const lastMinute = recent.filter((at) => now - at < MINUTE).length;
  if (lastMinute >= PER_MINUTE || recent.length >= PER_DAY) {
    calls.set(visitor, recent);
    return false;
  }
  recent.push(now);
  calls.set(visitor, recent);
  return true;
}
