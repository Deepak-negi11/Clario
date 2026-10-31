// Server only. A short, read-only summary of a public GitHub repo for the coworker AI: what it is,
// its top-level files (or the folder linked), the start of its README, and the start of a linked
// file. Calls only api.github.com, with the owner/repo/branch/path parse checked in
// @repo/shared (github-link.ts). Private or missing repos come back as a "not found" note, so the
// coworker can say so. GITHUB_TOKEN (optional, server-side) raises GitHub's limit of 60 calls an
// hour per server IP.

import { githubLabel, type GithubTarget } from "@repo/shared";

const API = "https://api.github.com";
const TIMEOUT_MS = 5_000;
const CACHE_MS = 10 * 60_000;
const README_CHARS = 3000;
const FILE_CHARS = 8000;
const MAX_ENTRIES = 80;

const cache = new Map<string, { at: number; text: string }>();
const CACHE_SIZE = 200;

function remember(key: string, text: string) {
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!); // oldest first
  cache.set(key, { at: Date.now(), text });
}

function headers(raw: boolean): HeadersInit {
  const token = process.env.GITHUB_TOKEN?.trim();
  return {
    accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
    "user-agent": "clario-coworkers",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function get(url: string, raw: boolean, signal: AbortSignal): Promise<Response> {
  return fetch(url, { headers: headers(raw), signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) });
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n… (cut)` : text);

type RepoInfo = { full_name?: string; description?: string | null; language?: string | null; default_branch?: string; stargazers_count?: number };
type Entry = { name?: string; type?: string };

/** The repo summary for the prompt, or null when GitHub couldn't be reached at all. */
export async function repoContext(target: GithubTarget, signal: AbortSignal): Promise<string | null> {
  const key = JSON.stringify(target);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;

  const base = `${API}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  try {
    const repoResponse = await get(base, false, signal);
    if (repoResponse.status === 404 || repoResponse.status === 403 || repoResponse.status === 451) {
      const text = `${githubLabel(target)}: not found. It is private or doesn't exist; only public repos can be read.`;
      remember(key, text);
      return text;
    }
    if (!repoResponse.ok) return null;
    const info = (await repoResponse.json()) as RepoInfo;
    const ref = target.ref ?? info.default_branch ?? "";
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const folder = target.kind === "tree" ? (target.path ?? "") : target.kind === "blob" ? (target.path ?? "").split("/").slice(0, -1).join("/") : "";

    const [readme, listing, file] = await Promise.all([
      get(`${base}/readme${refQuery}`, true, signal).then((response) => (response.ok ? response.text() : "")),
      get(`${base}/contents/${encodePath(folder)}${refQuery}`, false, signal).then((response) => (response.ok ? (response.json() as Promise<Entry[] | Entry>) : [])),
      target.kind === "blob" && target.path
        ? get(`${base}/contents/${encodePath(target.path)}${refQuery}`, true, signal).then((response) => (response.ok ? response.text() : ""))
        : Promise.resolve(""),
    ]);

    const entries = Array.isArray(listing) ? listing : [];
    const names = entries.slice(0, MAX_ENTRIES).map((entry) => `${entry.name ?? ""}${entry.type === "dir" ? "/" : ""}`).filter((name) => name !== "/");
    const lines = [
      `${info.full_name ?? githubLabel(target)}${info.description ? `: ${info.description}` : ""}`,
      [info.language && `Language: ${info.language}`, ref && `Branch: ${ref}`, info.stargazers_count !== undefined && `Stars: ${info.stargazers_count}`]
        .filter(Boolean)
        .join(" · "),
      names.length ? `Files in ${folder || "the top folder"}${entries.length > MAX_ENTRIES ? ` (first ${MAX_ENTRIES})` : ""}: ${names.join(", ")}` : "",
      // A NUL character means a binary file: say so instead of sending its bytes.
      file ? (file.includes("\u0000") ? `File ${target.path}: binary, not shown.` : `File ${target.path}:\n${clip(file, FILE_CHARS)}`) : "",
      readme ? `README (start):\n${clip(readme, README_CHARS)}` : "",
    ].filter(Boolean);
    const text = lines.join("\n");
    remember(key, text);
    return text;
  } catch (error) {
    if (signal.aborted) throw error;
    console.warn("[github] repo read failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
