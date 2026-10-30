import { RedisClient } from "bun";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
// How long a command that failed on a client that gave up waits for the new client before
// failing, and how long to wait between tries while Redis is still away.
const RETRY_WAIT_MS = 1_000;
const RECONNECT_PAUSE_MS = 2_000;

// When Redis goes away, Bun's client retries for about 30 seconds and then gives up for good: every
// command after that fails with "Connection has failed", even once Redis is back. So once it has
// given up, a new client is started in the background and takes over as soon as Redis answers it.
// `redis` always points at the client in use, so code that imports it needs nothing special.
let client = new RedisClient(REDIS_URL);
let replacing: Promise<void> | null = null;
const recoveredListeners = new Set<() => void>();

function gaveUp(used: RedisClient, error: unknown) {
  return !used.connected && (error as { code?: string } | null)?.code === "ERR_REDIS_CONNECTION_CLOSED";
}

function replaceClient() {
  replacing ??= (async () => {
    for (;;) {
      const next = new RedisClient(REDIS_URL);
      try {
        await next.send("PING", []);
        const old = client;
        client = next;
        old.close();
        for (const listener of recoveredListeners) listener();
        return;
      } catch {
        next.close();
        await Bun.sleep(RECONNECT_PAUSE_MS);
      }
    }
  })().finally(() => {
    replacing = null;
  });
  return replacing;
}

// Waits up to `ms` for a new client to take over; true when one has.
async function recovered(ms: number) {
  const before = client;
  await Promise.race([replaceClient(), Bun.sleep(ms)]);
  return client !== before;
}

// Called after a new client has taken over, for things that hold their own connection (pub/sub).
export function onRedisRecovered(listener: () => void) {
  recoveredListeners.add(listener);
  return () => recoveredListeners.delete(listener);
}

export const redis = new Proxy({} as RedisClient, {
  get(_, key) {
    const used = client;
    const value = Reflect.get(used, key, used) as unknown;
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      const result = (value as (...args: unknown[]) => unknown).apply(used, args);
      if (!(result instanceof Promise)) return result;
      return result.catch(async (error: unknown) => {
        // A command that failed this way never reached Redis, so it's safe to send again.
        if (!gaveUp(used, error) || !(await recovered(RETRY_WAIT_MS))) throw error;
        const retry = Reflect.get(client, key, client) as (...args: unknown[]) => unknown;
        return retry.apply(client, args);
      });
    };
  },
});
