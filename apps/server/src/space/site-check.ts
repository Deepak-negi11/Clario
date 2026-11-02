// Whether a team's website is up, for the server rack panel's health check: one HTTPS HEAD
// request from this server, and the time to the first line of the answer.
// The URL comes from a user, so it must never reach this server's own network: parseSiteUrl
// (@repo/shared) allows only https on the default port, the name is resolved here and every
// address must be public, and the connection goes to that checked address (so DNS can't change
// it in between), with the name only used for TLS and the Host header. Redirects aren't followed;
// any answer below 500 means the site is up.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { connect } from "node:tls";
import type { SiteCheck } from "@repo/shared";

const TIMEOUT_MS = 8_000;
const CACHE_SIZE = 200;
const HISTORY = 12;
export const SITE_FRESH_MS = { up: 5 * 60_000, down: 2 * 60_000 };

export class SiteError extends Error {}

type Resolve = (host: string) => Promise<string[]>;
// Connects to `address`, asks for `path` on `host`, and returns the status line's code.
type Probe = (address: string, host: string, path: string, timeoutMs: number) => Promise<{ status: number; certExpiresAt?: string }>;

function ipv4(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

// The 8 groups of an IPv6 address, or null.
function ipv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const v4 = ipv4(dotted[1]!);
    if (!v4) return null;
    text = text.slice(0, -dotted[1]!.length) + `${((v4[0]! << 8) | v4[1]!).toString(16)}:${((v4[2]! << 8) | v4[3]!).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail].map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return groups.length === 8 && groups.every((group) => !Number.isNaN(group)) ? groups : null;
}

function publicV4([a, b, c]: number[]): boolean {
  return !(
    a === 0 || a === 10 || a === 127 || a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** True only for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return publicV4(ipv4(address)!);
  if (version !== 6) return false;
  const g = ipv6(address);
  if (!g) return false;
  // An IPv4 address inside IPv6 (mapped, or NAT64's well-known prefix): judge the IPv4 one.
  const embedded = [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255];
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return publicV4(embedded);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return publicV4(embedded);
  // Otherwise only global unicast (2000::/3), less documentation, 6to4 and Teredo, which can hide
  // other addresses.
  if (g[0]! < 0x2000 || g[0]! > 0x3fff) return false;
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false;
  return g[0] !== 0x2002;
}

async function dnsResolve(host: string) {
  return (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
}

const TLS_PROBLEMS: Record<string, string> = {
  CERT_HAS_EXPIRED: "Its HTTPS certificate has expired",
  ERR_TLS_CERT_ALTNAME_INVALID: "Its HTTPS certificate is for a different name",
  DEPTH_ZERO_SELF_SIGNED_CERT: "Its HTTPS certificate is self-signed",
  SELF_SIGNED_CERT_IN_CHAIN: "Its HTTPS certificate is self-signed",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "Its HTTPS certificate can't be verified",
  ECONNREFUSED: "It refused the connection",
  ECONNRESET: "It closed the connection",
  EHOSTUNREACH: "It can't be reached",
  ENETUNREACH: "It can't be reached",
};

function tlsProbe(address: string, host: string, path: string, timeoutMs: number) {
  return new Promise<{ status: number; certExpiresAt?: string }>((resolve, reject) => {
    const socket = connect({ host: address, port: 443, servername: host, rejectUnauthorized: true, ALPNProtocols: ["http/1.1"] });
    let certExpiresAt: string | undefined;
    let head = "";
    const fail = (problem: string) => {
      clearTimeout(timer);
      socket.destroy();
      reject(new SiteError(problem));
    };
    const timer = setTimeout(() => fail(`It didn't answer within ${timeoutMs / 1000} seconds`), timeoutMs);
    socket.once("secureConnect", () => {
      const validTo = socket.getPeerCertificate()?.valid_to;
      if (validTo && !Number.isNaN(Date.parse(validTo))) certExpiresAt = new Date(validTo).toISOString();
      socket.write(`HEAD ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: clario-server-rack\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk: Buffer) => {
      head += chunk.toString("latin1");
      if (!head.includes("\r\n") && head.length < 512) return;
      const match = /^HTTP\/1\.[01] (\d{3})/.exec(head);
      if (!match) return fail("It answered with something that isn't a web page");
      clearTimeout(timer);
      socket.destroy();
      resolve({ status: Number(match[1]), certExpiresAt });
    });
    socket.once("error", (error: NodeJS.ErrnoException) => fail(TLS_PROBLEMS[error.code ?? ""] ?? "It couldn't be reached over HTTPS"));
    socket.once("end", () => fail("It closed the connection without answering"));
  });
}

type Options = { resolve?: Resolve; probe?: Probe; now?: () => number; timeoutMs?: number };

export function createSiteChecker(options: Options = {}) {
  const resolve = options.resolve ?? dnsResolve;
  const probe = options.probe ?? tlsProbe;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const cache = new Map<string, { until: number; value: SiteCheck }>();
  const pending = new Map<string, Promise<SiteCheck>>();
  // The last few checks of each site, for the uptime shown at the rack's UPS.
  const history = new Map<string, NonNullable<SiteCheck["history"]>>();

  async function load(url: string): Promise<SiteCheck> {
    const { hostname, pathname } = new URL(url);
    const down = (problem: string): SiteCheck => ({ url, up: false, problem, checkedAt: now() });
    let addresses: string[];
    try {
      addresses = await resolve(hostname);
    } catch {
      return down("Its name doesn't resolve");
    }
    if (!addresses.length) return down("Its name doesn't resolve");
    // One private address is enough to refuse: that name may be aimed at our own network.
    if (!addresses.every(isPublicAddress)) return down("It points to a private address, which isn't checked");
    const started = performance.now();
    try {
      const { status, certExpiresAt } = await probe(addresses[0]!, hostname, pathname || "/", timeoutMs);
      const ms = Math.round(performance.now() - started);
      return {
        url,
        up: status < 500,
        status,
        ms,
        ...(certExpiresAt ? { certExpiresAt } : {}),
        ...(status >= 500 ? { problem: `It answered with an error (${status})` } : {}),
        checkedAt: now(),
      };
    } catch (error) {
      return down(error instanceof SiteError ? error.message : "It couldn't be reached over HTTPS");
    }
  }

  /** The check for a URL from parseSiteUrl, from the cache while it is fresh. Never throws. */
  async function check(url: string): Promise<SiteCheck> {
    const cached = cache.get(url);
    if (cached && cached.until > now()) return cached.value;
    const running = pending.get(url);
    if (running) return running;
    const promise = load(url).then((fresh) => {
      const past = [...(history.get(url) ?? []), { at: fresh.checkedAt, up: fresh.up, ...(fresh.ms !== undefined ? { ms: fresh.ms } : {}) }].slice(-HISTORY);
      history.delete(url);
      if (history.size >= CACHE_SIZE) history.delete(history.keys().next().value!);
      history.set(url, past);
      const value: SiteCheck = { ...fresh, history: past };
      cache.delete(url);
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(url, { until: now() + (value.up ? SITE_FRESH_MS.up : SITE_FRESH_MS.down), value });
      return value;
    });
    pending.set(url, promise);
    try {
      return await promise;
    } finally {
      pending.delete(url);
    }
  }

  return { check };
}

export const siteChecker = createSiteChecker();
