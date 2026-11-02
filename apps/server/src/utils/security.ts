type Env = Record<string, string | undefined>;

export function jwtSecret(env: Env = process.env) {
  const secret = env.JWT_SECRET;
  if (env.NODE_ENV === "production" && (!secret || secret.length < 32 || /^(dev-secret|change-me)/i.test(secret))) {
    throw new Error("Set JWT_SECRET to a random secret of at least 32 characters before starting production.");
  }
  return secret || "dev-secret";
}

export function allowedOrigin(origin: string | null, env: Env = process.env) {
  if (!origin) return false;
  const configured = (env.CORS_ORIGIN ?? "http://localhost:3005").split(",").map((value) => value.trim());
  return configured.includes(origin) || (env.NODE_ENV !== "production" && /^https?:\/\/localhost(:\d+)?$/.test(origin));
}

// One bounded window per caller. Expired entries are removed on access; rejecting new keys
// when the table is full avoids trading rate limiting for unbounded memory use.
export function requestBudget(limit: number, windowMs: number, maxKeys = 10_000) {
  const windows = new Map<string, { until: number; count: number }>();
  return (key: string, now = Date.now()): number => {
    let window = windows.get(key);
    if (!window || window.until <= now) {
      for (const [id, entry] of windows) if (entry.until <= now) windows.delete(id);
      if (windows.size >= maxKeys) return Math.ceil(windowMs / 1000);
      window = { until: now + windowMs, count: 0 };
      windows.set(key, window);
    }
    if (++window.count > limit) return Math.max(1, Math.ceil((window.until - now) / 1000));
    return 0;
  };
}
