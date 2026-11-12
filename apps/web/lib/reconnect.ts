// How long to wait before reconnecting to the game server. Each try waits about twice as long as
// the one before (1 s, 2 s, 4 s, then 8 s), and each wait is spread from half to one and a half
// times that at random. When the server restarts, everyone's connection drops at the same moment;
// without the spread they would all come back at the same moment too, and rejoin in one burst.
const FIRST_MS = 1000;
const MAX_MS = 8000;

export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_MS, FIRST_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.5 + random()));
}
