// What a team's public GitHub repo is doing, for the server rack panel: the repo at a glance, and
// recent Actions runs, deployments (with the latest one's status), pull requests (Dependabot's
// marked as such), issues, releases and commits. GitHub's events feed would be one call, but it
// no longer carries pull request titles, so each list is read on its own.
// Calls only api.github.com, with an owner/repo checked by parseProjectRepo (@repo/shared).
// Each repo's answer is cached so many viewers share one read: GitHub allows 60 calls an hour per
// server IP without a token, so without GITHUB_TOKEN the cache lasts longer. The token stays here.

import { redis } from "../ws/redis";
import { parseSiteUrl, type ProjectRepo, type RepoActivity, type RepoItem, type RepoItemStatus, type RepoOverview } from "@repo/shared";

const API = "https://api.github.com";
// Slow networks take several seconds per call; past this, the panel says GitHub isn't answering.
const TIMEOUT_MS = 15_000;
const CACHE_SIZE = 200;
// A read is 8 calls, so 10 minutes keeps one watched repo under 60 calls an hour.
export const FRESH_MS = { token: 90_000, anonymous: 10 * 60_000, partial: 60_000, notFound: 2 * 60_000, unavailable: 30_000 };
const MAX = { runs: 4, deploys: 2, pulls: 10, issues: 8, releases: 2, commits: 3 };
// Of those read, how many of each reach the panel.
const SHOW = { pulls: 4, dependabot: 3, issues: 3 };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Where answers are kept beyond this process, so restarts and other servers share them. */
export type ActivityStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, seconds: number): Promise<void>;
};
const STORE_PREFIX = "rack:github:";
// GitHub's limit is per server address, not per repo: once it is reached, no repo is read until it resets.
const LIMIT_KEY = `${STORE_PREFIX}limited-until`;
// How long the last good answer is kept, to show while GitHub can't be read.
const KEEP_GOOD_S = 24 * 3600;

export const redisActivityStore: ActivityStore = {
  get: (key) => redis.get(key),
  set: async (key, value, seconds) => {
    await redis.send("SET", [key, value, "EX", String(Math.max(1, Math.ceil(seconds)))]);
  },
};

type Options = { fetch?: Fetch; now?: () => number; token?: () => string | undefined; store?: ActivityStore };
type Entry = { until: number; value: RepoActivity; good?: Extract<RepoActivity, { ok: true }> };

type Run = { id?: number; name?: string | null; status?: string | null; conclusion?: string | null; head_branch?: string | null; event?: string; updated_at?: string; html_url?: string };
type Deployment = { id?: number; environment?: string; ref?: string; created_at?: string };
type DeploymentStatus = { state?: string; created_at?: string };
type User = { login?: string } | null;
type Pull = { number?: number; title?: string; state?: string; draft?: boolean; merged_at?: string | null; updated_at?: string; html_url?: string; user?: User };
type Issue = { number?: number; title?: string; state?: string; updated_at?: string; html_url?: string; user?: User; pull_request?: unknown };
type Release = { id?: number; name?: string | null; tag_name?: string; prerelease?: boolean; draft?: boolean; published_at?: string | null; created_at?: string; html_url?: string };
type RepoInfo = {
  private?: boolean;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string | null;
  license?: { spdx_id?: string | null; name?: string } | null;
  default_branch?: string;
  pushed_at?: string;
  homepage?: string | null;
  size?: number;
};
type Commit = { sha?: string; html_url?: string; commit?: { message?: string; author?: { name?: string }; committer?: { date?: string } }; author?: { login?: string } | null };

class GithubError extends Error {
  constructor(
    readonly reason: "not-found" | "rate-limited" | "unavailable",
    readonly retryAt?: number,
  ) {
    super(reason);
  }
}

const clip = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const time = (value: string | undefined) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date(0).toISOString());

// Links from GitHub's answer are only passed on when they point at github.com.
function githubUrl(value: string | undefined, fallback: string) {
  return value?.startsWith("https://github.com/") ? value : fallback;
}

export function runStatus(status: string | null | undefined, conclusion: string | null | undefined): RepoItemStatus {
  if (status !== "completed") return status ? "running" : "unknown";
  if (conclusion === "success") return "passed";
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure" || conclusion === "action_required") return "failed";
  if (conclusion === "cancelled" || conclusion === "skipped" || conclusion === "stale" || conclusion === "neutral") return "cancelled";
  return "unknown";
}

export function deploymentStatus(state: string | undefined): RepoItemStatus {
  if (state === "success") return "passed";
  if (state === "failure" || state === "error") return "failed";
  if (state === "in_progress" || state === "queued" || state === "pending") return "running";
  if (state === "inactive") return "replaced";
  return "unknown";
}

export function mapRun(run: Run, home: string): RepoItem {
  return {
    kind: "run",
    id: `run-${run.id ?? 0}`,
    title: clip(run.name || "Workflow run"),
    detail: clip([run.head_branch, run.event].filter(Boolean).join(" · ")),
    status: runStatus(run.status, run.conclusion),
    at: time(run.updated_at),
    url: githubUrl(run.html_url, `${home}/actions`),
  };
}

export function mapDeployment(deployment: Deployment, latest: DeploymentStatus | undefined, home: string): RepoItem {
  const environment = deployment.environment || "production";
  const ref = deployment.ref ?? "";
  return {
    kind: "deploy",
    id: `deploy-${deployment.id ?? 0}`,
    title: clip(`Deploy to ${environment}`),
    detail: clip(/^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref),
    status: deploymentStatus(latest?.state),
    at: time(latest?.created_at ?? deployment.created_at),
    url: `${home}/deployments/${encodeURIComponent(environment)}`,
  };
}

const count = (value: number | undefined) => (Number.isInteger(value) && value! >= 0 ? value! : 0);

export function mapOverview(info: RepoInfo): RepoOverview {
  const license = info.license?.spdx_id && info.license.spdx_id !== "NOASSERTION" ? info.license.spdx_id : (info.license?.name ?? "");
  return {
    description: clip(info.description ?? "", 200),
    stars: count(info.stargazers_count),
    forks: count(info.forks_count),
    openIssues: count(info.open_issues_count),
    language: clip(info.language ?? "", 40),
    license: clip(license, 40),
    defaultBranch: clip(info.default_branch ?? "", 100),
    pushedAt: time(info.pushed_at),
    homepage: info.homepage ? parseSiteUrl(info.homepage) : null,
    sizeKb: count(info.size),
  };
}

// Dependabot's own pull requests are its security and version updates.
export function mapPull(pull: Pull, home: string): RepoItem {
  const dependabot = pull.user?.login === "dependabot[bot]";
  return {
    kind: dependabot ? "dependabot" : "pr",
    id: `pr-${pull.number ?? 0}`,
    title: clip(pull.title || (dependabot ? "Dependency update" : "Pull request")),
    detail: clip([`#${pull.number ?? "?"}`, !dependabot && pull.user?.login, pull.draft && "draft"].filter(Boolean).join(" · ")),
    status: pull.merged_at ? "merged" : pull.state === "closed" ? "closed" : "open",
    at: time(pull.updated_at),
    url: githubUrl(pull.html_url, `${home}/pulls`),
  };
}

export function mapIssue(issue: Issue, home: string): RepoItem {
  return {
    kind: "issue",
    id: `issue-${issue.number ?? 0}`,
    title: clip(issue.title || "Issue"),
    detail: clip([`#${issue.number ?? "?"}`, issue.user?.login].filter(Boolean).join(" · ")),
    status: issue.state === "closed" ? "closed" : "open",
    at: time(issue.updated_at),
    url: githubUrl(issue.html_url, `${home}/issues`),
  };
}

export function mapRelease(release: Release, home: string): RepoItem {
  const tag = release.tag_name ?? "";
  return {
    kind: "release",
    id: `release-${release.id ?? 0}`,
    title: clip(release.name || tag || "Release"),
    detail: clip([tag, release.prerelease && "pre-release"].filter(Boolean).join(" · ")),
    status: "released",
    at: time(release.published_at ?? release.created_at),
    url: githubUrl(release.html_url, `${home}/releases`),
  };
}

export function mapCommit(commit: Commit, home: string): RepoItem {
  const sha = /^[0-9a-f]{7,40}$/i.test(commit.sha ?? "") ? commit.sha! : "";
  return {
    kind: "commit",
    id: `commit-${sha}`,
    title: clip((commit.commit?.message ?? "").split("\n")[0] || "Commit"),
    detail: clip([sha.slice(0, 7), commit.author?.login ?? commit.commit?.author?.name].filter(Boolean).join(" · ")),
    status: "pushed",
    at: time(commit.commit?.committer?.date),
    url: githubUrl(commit.html_url, `${home}/commits`),
  };
}

export function createRepoActivityReader(options: Options = {}) {
  const fetcher: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  const token = options.token ?? (() => process.env.GITHUB_TOKEN?.trim() || undefined);
  const store = options.store;
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<RepoActivity>>();
  let limitedUntil = 0;
  // Answers with a section missing, re-read sooner.
  const partial = new WeakSet<RepoActivity>();

  async function get<T>(url: string): Promise<T> {
    const key = token();
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "clario-server-rack",
          "x-github-api-version": "2022-11-28",
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new GithubError("unavailable");
    }
    if (response.ok) return (await response.json()) as T;
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 429 || (response.status === 403 && (remaining === "0" || response.headers.has("retry-after")))) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const after = Number(response.headers.get("retry-after"));
      throw new GithubError("rate-limited", reset > 0 ? reset * 1000 : now() + (after > 0 ? after * 1000 : 60_000));
    }
    if (response.status === 404 || response.status === 403 || response.status === 451) throw new GithubError("not-found");
    // An empty repo has no commits yet.
    if (response.status === 409) return [] as T;
    throw new GithubError("unavailable");
  }

  async function load({ owner, repo }: ProjectRepo, label: string): Promise<RepoActivity> {
    const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const home = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    try {
      // The repo first: it says whether there is one, and whether it is public. A token might see
      // private repos: never show one (only public repos can be linked for now).
      const info = await get<RepoInfo>(base);
      if (info.private !== false) throw new GithubError("not-found");
      // A section GitHub doesn't answer in time is left out and the rest still show; a rate limit
      // fails the whole read.
      let missed = 0;
      const part = <T>(request: Promise<T>, empty: T) =>
        request.catch((error: unknown) => {
          if (error instanceof GithubError && error.reason === "rate-limited") throw error;
          missed++;
          return empty;
        });
      const list = <T>(value: T[] | unknown): T[] => (Array.isArray(value) ? value : []);
      const recent = `state=all&sort=updated&direction=desc`;
      const [runs, deployments, commits, pulls, issues, releases] = await Promise.all([
        part(get<{ workflow_runs?: Run[] }>(`${base}/actions/runs?per_page=${MAX.runs}`), {}),
        part(get<Deployment[]>(`${base}/deployments?per_page=${MAX.deploys}`), []),
        part(get<Commit[]>(`${base}/commits?per_page=${MAX.commits}`), []),
        part(get<Pull[]>(`${base}/pulls?${recent}&per_page=${MAX.pulls}`), []),
        part(get<Issue[]>(`${base}/issues?${recent}&per_page=${MAX.issues}`), []),
        part(get<Release[]>(`${base}/releases?per_page=${MAX.releases}`), []),
      ]);
      if (missed === 6) throw new GithubError("unavailable");
      // Only the newest deployment's status is read; the older one shows without it.
      const deploys = list<Deployment>(deployments).slice(0, MAX.deploys);
      const latest = Number.isInteger(deploys[0]?.id)
        ? await get<DeploymentStatus[]>(`${base}/deployments/${deploys[0]!.id}/statuses?per_page=1`).then((each) => list<DeploymentStatus>(each)[0]).catch(() => undefined)
        : undefined;
      const pullItems = list<Pull>(pulls).map((pull) => mapPull(pull, home));
      const items = [
        ...list<Run>(runs.workflow_runs).slice(0, MAX.runs).map((run) => mapRun(run, home)),
        ...deploys.map((deployment, i) => mapDeployment(deployment, i === 0 ? latest : undefined, home)),
        ...pullItems.filter((item) => item.kind === "pr").slice(0, SHOW.pulls),
        ...pullItems.filter((item) => item.kind === "dependabot").slice(0, SHOW.dependabot),
        // The issues list includes pull requests; those are already above.
        ...list<Issue>(issues).filter((issue) => !issue.pull_request).slice(0, SHOW.issues).map((issue) => mapIssue(issue, home)),
        ...list<Release>(releases).filter((release) => !release.draft).slice(0, MAX.releases).map((release) => mapRelease(release, home)),
        ...list<Commit>(commits).slice(0, MAX.commits).map((commit) => mapCommit(commit, home)),
      ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const value: RepoActivity = { ok: true, repo: label, fetchedAt: now(), overview: mapOverview(info), items };
      if (missed) partial.add(value);
      return value;
    } catch (error) {
      const failure = error instanceof GithubError ? error : new GithubError("unavailable");
      if (!(error instanceof GithubError)) console.warn("[github] rack activity read failed:", error instanceof Error ? error.message : error);
      return { ok: false, repo: label, fetchedAt: now(), reason: failure.reason, ...(failure.retryAt ? { retryAt: failure.retryAt } : {}) };
    }
  }

  function freshFor(value: RepoActivity) {
    if (value.ok && partial.has(value)) return FRESH_MS.partial;
    if (value.ok) return token() ? FRESH_MS.token : FRESH_MS.anonymous;
    if (value.reason === "rate-limited") return Math.max(30_000, (value.retryAt ?? 0) - now());
    return value.reason === "not-found" ? FRESH_MS.notFound : FRESH_MS.unavailable;
  }

  // The shared store is a help, not a need: when Redis is away, this server's memory still works.
  async function stored<T>(key: string): Promise<T | null> {
    try {
      const text = store ? await store.get(key) : null;
      return text ? (JSON.parse(text) as T) : null;
    } catch {
      return null;
    }
  }
  function keep(key: string, value: unknown, seconds: number) {
    store?.set(key, JSON.stringify(value), seconds).catch(() => {});
  }
  function remember(key: string, entry: Entry) {
    cache.delete(key);
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!); // oldest first
    cache.set(key, entry);
  }

  async function refresh(target: ProjectRepo, label: string, key: string, cached: Entry | undefined): Promise<RepoActivity> {
    // Another server (or this one before a restart) may have read it already.
    const shared = await stored<Entry>(STORE_PREFIX + key);
    if (shared && shared.until > now()) {
      remember(key, shared);
      return shared.value;
    }
    const good = cached?.good ?? shared?.good;
    const limit = Math.max(limitedUntil, (await stored<number>(LIMIT_KEY)) ?? 0);
    const fresh: RepoActivity =
      limit > now() ? { ok: false, repo: label, fetchedAt: now(), reason: "rate-limited", retryAt: limit } : await load(target, label);
    if (!fresh.ok && fresh.reason === "rate-limited") {
      limitedUntil = fresh.retryAt ?? now() + 60_000;
      keep(LIMIT_KEY, limitedUntil, (limitedUntil - now()) / 1000);
    }
    // GitHub out of calls or not answering: keep showing the last good answer, marked as older. A
    // repo GitHub now says isn't there (deleted, or made private) is never shown from before.
    const nextGood = fresh.ok ? fresh : fresh.reason === "not-found" ? undefined : good;
    const value: RepoActivity =
      !fresh.ok && fresh.reason !== "not-found" && good
        ? { ...good, stale: { reason: fresh.reason, ...(fresh.retryAt ? { retryAt: fresh.retryAt } : {}) } }
        : fresh;
    const entry: Entry = { until: now() + freshFor(fresh), value, ...(nextGood ? { good: nextGood } : {}) };
    remember(key, entry);
    keep(STORE_PREFIX + key, entry, KEEP_GOOD_S);
    return value;
  }

  /** The repo's activity, from the cache while it is fresh. Never throws. */
  async function read(target: ProjectRepo): Promise<RepoActivity> {
    const label = `${target.owner}/${target.repo}`;
    const key = label.toLowerCase();
    const cached = cache.get(key);
    if (cached && cached.until > now()) return cached.value;
    const running = pending.get(key);
    if (running) return running;
    const promise = refresh(target, label, key, cached);
    pending.set(key, promise);
    try {
      return await promise;
    } finally {
      pending.delete(key);
    }
  }

  return { read };
}

export const repoActivity = createRepoActivityReader({ store: redisActivityStore });
