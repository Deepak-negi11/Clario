import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import prisma from "@repo/db";
import { parseProjectRepo, type ProjectRepo, type RepoActivity, type SiteCheck } from "@repo/shared";
import { startServer } from "../../index";
import { removeUser, setUserOnline } from "../ws/presence";
import { FRESH_MS, createRepoActivityReader, type ActivityStore, deploymentStatus, mapCommit, mapOverview, runStatus } from "./github-activity";
import { setRepoActivityReader, setSiteChecker } from "./project";
import { SITE_FRESH_MS, SiteError, createSiteChecker, isPublicAddress } from "./site-check";

const HOME = "https://github.com/acme/app";

// A fake api.github.com: answers by path, and records every call.
function fakeGithub(answers: Record<string, () => Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const answer = answers[path];
    return answer ? answer() : new Response("{}", { status: 404 });
  };
  return { fetch, calls };
}

const healthy = {
  "/repos/acme/app": () =>
    Response.json({ private: false, description: "The app", stargazers_count: 12, forks_count: 3, open_issues_count: 4, language: "TypeScript", license: { spdx_id: "MIT" }, default_branch: "main", pushed_at: "2026-11-02T11:00:00Z", homepage: "https://acme.dev", size: 2048 }),
  "/repos/acme/app/actions/runs": () =>
    Response.json({
      workflow_runs: [
        { id: 11, name: "CI", status: "completed", conclusion: "success", head_branch: "main", event: "push", updated_at: "2026-11-02T10:00:00Z", html_url: `${HOME}/actions/runs/11` },
        { id: 12, name: "CI", status: "in_progress", conclusion: null, head_branch: "fix", event: "pull_request", updated_at: "2026-11-02T12:00:00Z", html_url: "https://evil.example/x" },
      ],
    }),
  "/repos/acme/app/deployments": () => Response.json([{ id: 7, environment: "staging", ref: "a".repeat(40), created_at: "2026-11-02T09:00:00Z" }]),
  "/repos/acme/app/deployments/7/statuses": () => Response.json([{ state: "failure", created_at: "2026-11-02T09:05:00Z" }]),
  "/repos/acme/app/commits": () =>
    Response.json([{ sha: "b".repeat(40), html_url: `${HOME}/commit/${"b".repeat(40)}`, commit: { message: "Fix login\n\nLonger body", author: { name: "Ana" }, committer: { date: "2026-11-02T11:00:00Z" } }, author: { login: "ana" } }]),
  "/repos/acme/app/pulls": () =>
    Response.json([
      { number: 42, title: "Bump next from 16.0.0 to 16.0.1", state: "open", updated_at: "2026-11-01T08:00:00Z", html_url: `${HOME}/pull/42`, user: { login: "dependabot[bot]" } },
      { number: 40, title: "Add search", state: "closed", merged_at: "2026-11-01T07:00:00Z", updated_at: "2026-11-01T07:00:00Z", html_url: `${HOME}/pull/40`, user: { login: "ana" } },
      { number: 39, title: "Try a new font", state: "closed", merged_at: null, updated_at: "2026-11-01T06:00:00Z", html_url: `${HOME}/pull/39`, user: { login: "bo" } },
    ]),
  "/repos/acme/app/issues": () =>
    Response.json([
      { number: 41, title: "Login is slow", state: "open", updated_at: "2026-11-01T05:00:00Z", html_url: `${HOME}/issues/41`, user: { login: "cy" } },
      { number: 40, title: "Add search", state: "closed", updated_at: "2026-11-01T07:00:00Z", html_url: `${HOME}/pull/40`, pull_request: {} },
    ]),
  "/repos/acme/app/releases": () =>
    Response.json([
      { id: 2, name: "v2 draft", tag_name: "v2.0.0", draft: true, created_at: "2026-11-01T04:30:00Z" },
      { id: 1, name: "", tag_name: "v1.4.0", published_at: "2026-11-01T04:00:00Z", html_url: `${HOME}/releases/tag/v1.4.0` },
    ]),
};

const repo: ProjectRepo = { owner: "acme", repo: "app" };

describe("parseProjectRepo", () => {
  test("takes owner/repo from a link or a bare name, and nothing else", () => {
    expect(parseProjectRepo("https://github.com/vercel/next.js/tree/canary/packages")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseProjectRepo(" vercel/next.js ")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseProjectRepo("https://github.com/acme/app.git")).toEqual({ owner: "acme", repo: "app" });
    expect(parseProjectRepo("https://gitlab.com/acme/app")).toBeNull();
    expect(parseProjectRepo("https://github.com/../etc")).toBeNull();
    expect(parseProjectRepo("acme/app/../../x")).toBeNull();
    expect(parseProjectRepo("")).toBeNull();
  });
});

describe("repo activity reader", () => {
  test("maps runs, deployments, pull requests, issues, releases and commits, newest first, with github.com links only", async () => {
    const github = fakeGithub(healthy);
    const activity = await createRepoActivityReader({ fetch: github.fetch, token: () => undefined }).read(repo);
    if (!activity.ok) throw new Error(activity.reason);
    expect(activity.repo).toBe("acme/app");
    expect(activity.items.map((item) => [item.kind, item.status])).toEqual([
      ["run", "running"],
      ["commit", "pushed"],
      ["run", "passed"],
      ["deploy", "failed"],
      ["dependabot", "open"],
      ["pr", "merged"],
      ["pr", "closed"],
      ["issue", "open"],
      ["release", "released"],
    ]);
    expect(activity.items[0]!.url).toBe(`${HOME}/actions`); // Not the evil.example link.
    expect(activity.items.find((item) => item.kind === "deploy")).toMatchObject({ title: "Deploy to staging", detail: "aaaaaaa", url: `${HOME}/deployments/staging` });
    expect(activity.items.find((item) => item.kind === "commit")).toMatchObject({ title: "Fix login", detail: "bbbbbbb · ana" });
    expect(activity.items.find((item) => item.kind === "pr")).toMatchObject({ title: "Add search", detail: "#40 · ana" });
    expect(activity.items.find((item) => item.kind === "release")).toMatchObject({ title: "v1.4.0", detail: "v1.4.0" });
    expect(activity.overview).toEqual({
      description: "The app",
      stars: 12,
      forks: 3,
      openIssues: 4,
      language: "TypeScript",
      license: "MIT",
      defaultBranch: "main",
      pushedAt: "2026-11-02T11:00:00.000Z",
      homepage: "https://acme.dev/",
      sizeKb: 2048,
    });
    // 8 calls (the repo, six lists, the newest deployment's status), all to api.github.com, with
    // no redirects followed and no token when none is set.
    expect(github.calls).toHaveLength(8);
    expect(github.calls.every(({ url, init }) => url.startsWith("https://api.github.com/") && init.redirect === "error")).toBe(true);
    expect(github.calls.some(({ init }) => JSON.stringify(init.headers).includes("authorization"))).toBe(false);
  });

  test("the overview passes on only an https website and sane numbers", () => {
    expect(mapOverview({ homepage: "http://acme.dev", stargazers_count: -1, license: { spdx_id: "NOASSERTION", name: "Other" } })).toMatchObject({ homepage: null, stars: 0, license: "Other" });
    expect(mapOverview({ homepage: "javascript:alert(1)" }).homepage).toBeNull();
    expect(mapOverview({ homepage: "https://localhost" }).homepage).toBeNull();
  });

  test("shares one read between viewers until it goes stale", async () => {
    const github = fakeGithub(healthy);
    let now = 1_000_000;
    const reader = createRepoActivityReader({ fetch: github.fetch, now: () => now, token: () => undefined });
    const [a, b] = await Promise.all([reader.read(repo), reader.read({ owner: "ACME", repo: "App" })]);
    expect(a).toBe(b);
    const calls = github.calls.length;
    now += FRESH_MS.anonymous - 1;
    await reader.read(repo);
    expect(github.calls.length).toBe(calls);
    now += 2;
    await reader.read(repo);
    expect(github.calls.length).toBe(calls * 2);
  });

  test("sends the token when set, and never shows a private repo", async () => {
    const github = fakeGithub({ ...healthy, "/repos/acme/app": () => Response.json({ private: true, description: "secret plans" }) });
    const activity = await createRepoActivityReader({ fetch: github.fetch, token: () => "secret-token" }).read(repo);
    expect(activity).toMatchObject({ ok: false, reason: "not-found" });
    expect(JSON.stringify(activity)).not.toContain("secret plans");
    expect(github.calls).toHaveLength(1);
    expect(JSON.stringify(github.calls[0]!.init.headers)).toContain("Bearer secret-token");
  });

  test("rate limits, missing repos and outages come back calmly", async () => {
    const reset = 2_000_000;
    const limited = fakeGithub({
      ...healthy,
      "/repos/acme/app/actions/runs": () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } }),
    });
    expect(await createRepoActivityReader({ fetch: limited.fetch, token: () => undefined }).read(repo)).toMatchObject({ ok: false, reason: "rate-limited", retryAt: reset * 1000 });

    const missing = fakeGithub({});
    expect(await createRepoActivityReader({ fetch: missing.fetch, token: () => undefined }).read(repo)).toMatchObject({ ok: false, reason: "not-found" });
    expect(missing.calls).toHaveLength(1); // No list is read for a repo that isn't there.

    const down = createRepoActivityReader({ fetch: () => Promise.reject(new Error("ECONNRESET")), token: () => undefined });
    expect(await down.read(repo)).toMatchObject({ ok: false, reason: "unavailable" });

    // A list GitHub refuses alone (Actions turned off, say) keeps the rest.
    const noActions = fakeGithub({ ...healthy, "/repos/acme/app/actions/runs": () => new Response("{}", { status: 404 }) });
    const partial = await createRepoActivityReader({ fetch: noActions.fetch, token: () => undefined }).read(repo);
    expect(partial.ok && partial.items.some((item) => item.kind === "run")).toBe(false);
    expect(partial.ok && partial.items.length).toBe(7);
  });

  test("a section that times out is left out; a failed refresh keeps the last good answer", async () => {
    const timeout = () => {
      throw new Error("The operation timed out.");
    };
    const slow = fakeGithub({ ...healthy, "/repos/acme/app/deployments": timeout });
    const partial = await createRepoActivityReader({ fetch: slow.fetch, token: () => undefined }).read(repo);
    expect(partial.ok && partial.items.some((item) => item.kind === "deploy")).toBe(false);
    expect(partial.ok && partial.items.length).toBe(8);

    let now = 5_000_000;
    let down = false;
    const flaky = fakeGithub(healthy);
    const reader = createRepoActivityReader({ fetch: (url, init) => (down ? Promise.reject(new Error("ECONNRESET")) : flaky.fetch(url, init)), now: () => now, token: () => undefined });
    const good = await reader.read(repo);
    down = true;
    now += FRESH_MS.anonymous + 1;
    expect(await reader.read(repo)).toMatchObject({ ...good, stale: { reason: "unavailable" } });
    // Once nothing good was ever read, the outage shows.
    expect(await reader.read({ owner: "acme", repo: "other" })).toMatchObject({ ok: false, reason: "unavailable" });
  });

  // A stand-in for Redis: values with an expiry, shared by every reader given it.
  function fakeStore(clock: () => number) {
    const values = new Map<string, { text: string; until: number }>();
    const store: ActivityStore = {
      get: async (key) => {
        const entry = values.get(key);
        return entry && entry.until > clock() ? entry.text : null;
      },
      set: async (key, text, seconds) => {
        values.set(key, { text, until: clock() + seconds * 1000 });
      },
    };
    return { store, values };
  }

  test("a restart, or another server, reuses the stored answer instead of calling GitHub", async () => {
    let now = 10_000_000;
    const { store } = fakeStore(() => now);
    const github = fakeGithub(healthy);
    const first = await createRepoActivityReader({ fetch: github.fetch, now: () => now, token: () => undefined, store }).read(repo);
    const calls = github.calls.length;
    now += 60_000;
    const restarted = await createRepoActivityReader({ fetch: github.fetch, now: () => now, token: () => undefined, store }).read(repo);
    expect(restarted).toEqual(first);
    expect(github.calls.length).toBe(calls);
  });

  test("a rate limit stops every repo's reads until GitHub resets, and older answers show meanwhile", async () => {
    let now = 20_000_000;
    const { store } = fakeStore(() => now);
    const reset = Math.floor((now + 30 * 60_000) / 1000);
    let limited = false;
    const github = fakeGithub(healthy);
    const fetch = (url: string, init: RequestInit) =>
      limited
        ? Promise.resolve(new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } }))
        : github.fetch(url, init);
    const good = await createRepoActivityReader({ fetch, now: () => now, token: () => undefined, store }).read(repo);
    limited = true;
    now += FRESH_MS.anonymous + 1;
    const server = createRepoActivityReader({ fetch, now: () => now, token: () => undefined, store });
    expect(await server.read(repo)).toMatchObject({ ok: true, fetchedAt: good.fetchedAt, stale: { reason: "rate-limited", retryAt: reset * 1000 } });
    // Another server, another repo: it knows about the limit and doesn't call GitHub at all.
    const calls = github.calls.length;
    let tried = 0;
    const other = createRepoActivityReader({ fetch: (url, init) => (tried++, fetch(url, init)), now: () => now, token: () => undefined, store });
    expect(await other.read({ owner: "acme", repo: "other" })).toMatchObject({ ok: false, reason: "rate-limited", retryAt: reset * 1000 });
    expect(tried).toBe(0);
    expect(github.calls.length).toBe(calls);
  });

  test("a repo GitHub now says isn't there is never shown from before", async () => {
    let now = 30_000_000;
    const { store } = fakeStore(() => now);
    let gone = false;
    const github = fakeGithub(healthy);
    const fetch = (url: string, init: RequestInit) => (gone ? Promise.resolve(new Response("{}", { status: 404 })) : github.fetch(url, init));
    await createRepoActivityReader({ fetch, now: () => now, token: () => undefined, store }).read(repo);
    gone = true;
    now += FRESH_MS.anonymous + 1;
    expect(await createRepoActivityReader({ fetch, now: () => now, token: () => undefined, store }).read(repo)).toMatchObject({ ok: false, reason: "not-found" });
    // And it isn't kept as a fallback either.
    gone = false;
    now += FRESH_MS.notFound + 1;
    const down = createRepoActivityReader({ fetch: () => Promise.reject(new Error("ECONNRESET")), now: () => now, token: () => undefined, store });
    expect(await down.read(repo)).toMatchObject({ ok: false, reason: "unavailable" });
  });

  test("Redis being away doesn't stop reads", async () => {
    const broken: ActivityStore = { get: () => Promise.reject(new Error("Connection has failed")), set: () => Promise.reject(new Error("Connection has failed")) };
    const activity = await createRepoActivityReader({ fetch: fakeGithub(healthy).fetch, token: () => undefined, store: broken }).read(repo);
    expect(activity.ok).toBe(true);
  });

  test("statuses map to running, passed, failed and the rest", () => {
    expect(runStatus("queued", null)).toBe("running");
    expect(runStatus("completed", "timed_out")).toBe("failed");
    expect(runStatus("completed", "cancelled")).toBe("cancelled");
    expect(deploymentStatus("success")).toBe("passed");
    expect(deploymentStatus("error")).toBe("failed");
    expect(deploymentStatus("inactive")).toBe("replaced");
    expect(deploymentStatus(undefined)).toBe("unknown");
    expect(mapCommit({ sha: "not a sha", html_url: "javascript:alert(1)" }, HOME)).toMatchObject({ url: `${HOME}/commits`, detail: "" });
  });
});

describe("website check", () => {
  test("only public addresses count", () => {
    for (const ok of ["8.8.8.8", "64.239.123.65", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"]) expect(isPublicAddress(ok)).toBe(true);
    for (const bad of [
      "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
      "224.0.0.1", "255.255.255.255", "192.0.2.1", "198.18.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1",
      "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2001:db8::1", "2002:c0a8:101::1", "2001:0::1",
      "localhost", "example.com", "", "1.2.3", "::ffff:999.1.1.1",
    ])
      expect(isPublicAddress(bad)).toBe(false);
  });

  test("a name aimed at a private address is never connected to", async () => {
    const probed: string[] = [];
    const probe = async (address: string) => {
      probed.push(address);
      return { status: 200 };
    };
    const inside = createSiteChecker({ resolve: async () => ["169.254.169.254"], probe });
    expect(await inside.check("https://metadata.acme.dev/")).toMatchObject({ up: false, problem: expect.stringContaining("private address") });
    const mixed = createSiteChecker({ resolve: async () => ["8.8.8.8", "10.0.0.1"], probe });
    expect((await mixed.check("https://acme.dev/")).up).toBe(false);
    expect(probed).toEqual([]);
  });

  test("connects to the checked address with the site's name, and reads the answer", async () => {
    const seen: unknown[] = [];
    const checker = createSiteChecker({
      resolve: async () => ["8.8.8.8"],
      probe: async (address, host, path) => {
        seen.push([address, host, path]);
        return { status: path === "/broken" ? 503 : 301, certExpiresAt: "2026-12-22T22:38:25.000Z" };
      },
    });
    expect(await checker.check("https://acme.dev/")).toMatchObject({ up: true, status: 301, certExpiresAt: "2026-12-22T22:38:25.000Z" });
    expect(seen[0]).toEqual(["8.8.8.8", "acme.dev", "/"]);
    expect(await checker.check("https://acme.dev/broken")).toMatchObject({ up: false, status: 503, problem: "It answered with an error (503)" });
    const failing = createSiteChecker({ resolve: async () => ["8.8.8.8"], probe: () => Promise.reject(new SiteError("Its HTTPS certificate has expired")) });
    expect(await failing.check("https://acme.dev/")).toMatchObject({ up: false, problem: "Its HTTPS certificate has expired" });
    const unknown = createSiteChecker({ resolve: () => Promise.reject(new Error("ENOTFOUND")), probe: async () => ({ status: 200 }) });
    expect(await unknown.check("https://nope.acme.dev/")).toMatchObject({ up: false, problem: "Its name doesn't resolve" });
  });

  test("one check is shared until it goes stale", async () => {
    let now = 1_000;
    let probes = 0;
    const checker = createSiteChecker({ resolve: async () => ["8.8.8.8"], probe: async () => (probes++, { status: 200 }), now: () => now });
    await Promise.all([checker.check("https://acme.dev/"), checker.check("https://acme.dev/")]);
    now += SITE_FRESH_MS.up - 1;
    await checker.check("https://acme.dev/");
    expect(probes).toBe(1);
    now += 2;
    const second = await checker.check("https://acme.dev/");
    expect(probes).toBe(2);
    // Each new check adds to the site's history (for the uptime at the UPS); cached answers don't.
    expect(second.history?.map((each) => each.up)).toEqual([true, true]);
  });
});

describe("Project routes", () => {
  const PORT = 4021;
  let server: ReturnType<typeof startServer>;
  const client = axios.create({ baseURL: `http://localhost:${PORT}`, validateStatus: () => true });
  const userIds: string[] = [];
  let spaceId = "";
  const reads: ProjectRepo[] = [];
  const checks: string[] = [];

  async function makeUser() {
    const email = `project-test-${crypto.randomUUID()}@test.com`;
    const password = "password123";
    const signup = await client.post("/api/v1/signup", { username: `proj-${crypto.randomUUID().slice(0, 8)}`, password, email, type: "user" });
    const signin = await client.post("/api/v1/signin", { email, password });
    userIds.push(signup.data.userId);
    return { userId: signup.data.userId as string, auth: { headers: { Authorization: `Bearer ${signin.data.token}` } } };
  }

  let owner: Awaited<ReturnType<typeof makeUser>>;
  let member: Awaited<ReturnType<typeof makeUser>>;
  let stranger: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    setRepoActivityReader({
      read: async (target): Promise<RepoActivity> => {
        reads.push(target);
        return target.repo === "missing"
          ? { ok: false, repo: `${target.owner}/${target.repo}`, fetchedAt: 1, reason: "not-found" }
          : { ok: true, repo: `${target.owner}/${target.repo}`, fetchedAt: 1, items: [], overview: mapOverview({ homepage: "https://acme.dev" }) };
      },
    });
    setSiteChecker({
      check: async (url): Promise<SiteCheck> => {
        checks.push(url);
        return { url, up: true, status: 200, ms: 40, checkedAt: 1 };
      },
    });
    server = startServer(PORT);
    owner = await makeUser();
    member = await makeUser();
    stranger = await makeUser();
    const space = await client.post("/api/v1/space", { name: "Project test", dimensions: "20x20" }, owner.auth);
    spaceId = space.data.spaceId;
    await setUserOnline(spaceId, member.userId, { x: 1, y: 1 });
  });

  afterAll(async () => {
    for (const userId of userIds) await removeUser(spaceId, userId);
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server.stop(true);
  });

  const path = () => `/api/v1/space/${spaceId}/project`;

  test("needs a token and a real space", async () => {
    expect((await client.get(path())).status).toBe(403);
    expect((await client.get("/api/v1/space/nope/project", owner.auth)).status).toBe(404);
  });

  test("only the owner connects, changes or removes the project", async () => {
    expect((await client.put(path(), { link: "https://github.com/acme/app" }, member.auth)).status).toBe(403);
    expect((await client.put(path(), { link: "https://example.com/acme/app" }, owner.auth)).status).toBe(400);
    expect((await client.put(path(), { link: 5 }, owner.auth)).status).toBe(400);
    const missing = await client.put(path(), { link: "https://github.com/acme/missing" }, owner.auth);
    expect(missing.status).toBe(404);
    expect(missing.data.message).toContain("acme/missing");

    const saved = await client.put(path(), { link: "https://github.com/acme/app/blob/main/README.md" }, owner.auth);
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({ repo: "acme/app", canEdit: true, activity: { ok: true } });
    expect((await prisma.space.findUnique({ where: { id: spaceId } }))?.githubRepo).toBe("acme/app");
  });

  test("people in the space see it; others don't", async () => {
    const seen = await client.get(path(), member.auth);
    expect(seen.status).toBe(200);
    // No website set: the repo's own website is checked.
    expect(seen.data).toMatchObject({ repo: "acme/app", website: null, canEdit: false, activity: { ok: true, repo: "acme/app" }, site: { url: "https://acme.dev/", up: true } });
    expect(reads.at(-1)).toEqual({ owner: "acme", repo: "app" });
    expect((await client.get(path(), stranger.auth)).status).toBe(403);
    expect((await client.get(path(), owner.auth)).data.canEdit).toBe(true);
  });

  test("the owner sets the website on its own; only https public names are taken", async () => {
    expect((await client.put(path(), { website: "https://status.acme.dev" }, member.auth)).status).toBe(403);
    for (const bad of ["http://acme.dev", "https://localhost", "https://10.0.0.1", "https://acme.dev:8080"]) {
      expect((await client.put(path(), { website: bad }, owner.auth)).status).toBe(400);
    }
    expect((await client.put(path(), {}, owner.auth)).status).toBe(400);
    const saved = await client.put(path(), { website: "status.acme.dev" }, owner.auth);
    expect(saved.data).toMatchObject({ repo: "acme/app", website: "https://status.acme.dev/", site: { url: "https://status.acme.dev/" } });
    expect(checks.at(-1)).toBe("https://status.acme.dev/");
  });

  test("an empty link removes the repo; then only the website is checked", async () => {
    const before = reads.length;
    const removed = await client.put(path(), { link: null }, owner.auth);
    expect(removed.data).toMatchObject({ repo: null, website: "https://status.acme.dev/", activity: null, site: { up: true } });
    expect((await client.put(path(), { website: "" }, owner.auth)).data).toEqual({ repo: null, website: null, canEdit: true, activity: null, site: null });
    expect((await client.get(path(), member.auth)).data).toEqual({ repo: null, website: null, canEdit: false, activity: null, site: null });
    expect(reads.length).toBe(before);
  });
});
