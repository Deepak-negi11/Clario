import { expect, test } from "bun:test";
import type { RepoItem, SpaceProject } from "@repo/shared";
import { RACK_UNITS } from "./server-rack";
import { UNIT_FEED, rackReport } from "./rack-report";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const item = (
  kind: RepoItem["kind"],
  status: RepoItem["status"],
  title = kind,
): RepoItem => ({
  kind,
  id: `${kind}-${title}`,
  title,
  detail: "",
  status,
  at: "2026-11-03T11:00:00Z",
  url: "https://github.com/acme/app",
});
const project = (
  over: Partial<SpaceProject> = {},
  items: RepoItem[] = [],
): SpaceProject => ({
  repo: "acme/app",
  website: null,
  canEdit: false,
  activity: {
    ok: true,
    repo: "acme/app",
    fetchedAt: NOW,
    items,
    overview: {
      description: "",
      stars: 1,
      forks: 0,
      openIssues: 7,
      language: "Rust",
      license: "MIT",
      defaultBranch: "main",
      pushedAt: "2026-11-03T11:30:00Z",
      homepage: null,
      sizeKb: 85_000,
    },
  },
  site: null,
  ...over,
});

test("nothing linked: the rack keeps its usual lights", () => {
  expect(rackReport(null, NOW)).toBeNull();
  expect(
    rackReport(
      { repo: null, website: null, canEdit: true, activity: null, site: null },
      NOW,
    ),
  ).toBeNull();
});

test("every unit has a report and a feed mapping", () => {
  const report = rackReport(project(), NOW)!;
  for (const unit of RACK_UNITS) {
    expect(report[unit.id]?.lines.length).toBeGreaterThan(0);
    expect(unit.id in UNIT_FEED).toBe(true);
  }
});

test("the build runner shows the newest run's state", () => {
  const failing = rackReport(
    project({}, [item("run", "failed", "CI"), item("run", "passed")]),
    NOW,
  )!;
  expect(failing.ci).toEqual({
    health: "fail",
    lines: ["Last 2 runs: 1 passed · 1 failed", "Newest: CI, failed"],
  });
  const busy = rackReport(
    project({}, [item("run", "passed"), item("run", "running")]),
    NOW,
  )!;
  expect(busy.ci!.health).toBe("busy");
  expect(busy.pdu).toEqual({
    health: "busy",
    lines: [
      "Busy: 1 build or deploy running",
      "7 open issues and pull requests",
    ],
  });
  expect(rackReport(project(), NOW)!.ci!.health).toBe("idle");
});

test("website, certificate and uptime come from the health checks", () => {
  const site = {
    url: "https://acme.dev/",
    up: true,
    status: 200,
    ms: 80,
    certExpiresAt: "2026-11-10T12:00:00Z",
    checkedAt: NOW,
    history: [
      { at: NOW - 600_000, up: false },
      { at: NOW, up: true, ms: 80 },
    ],
  };
  const report = rackReport(project({ site }), NOW)!;
  expect(report.switch).toEqual({
    health: "ok",
    lines: ["acme.dev answered (200) in 80 ms"],
  });
  expect(report.firewall!.health).toBe("warn"); // 7 days of certificate left
  expect(report.firewall!.lines[0]).toBe("HTTPS certificate: 7 days left");
  expect(report.ups).toEqual({
    health: "warn",
    lines: ["Website up in 1 of the last 2 checks"],
  });
  const expired = rackReport(
    project({
      site: {
        url: "https://acme.dev/",
        up: false,
        problem: "Its HTTPS certificate has expired",
        checkedAt: NOW,
      },
    }),
    NOW,
  )!;
  expect(expired.firewall!.health).toBe("fail");
  expect(expired.switch!.health).toBe("fail");
  expect(expired.ups!.health).toBe("fail");
});

test("a website alone still lights the network parts; the rest wait for a repo", () => {
  const report = rackReport(
    {
      repo: null,
      website: "https://acme.dev/",
      canEdit: false,
      activity: null,
      site: {
        url: "https://acme.dev/",
        up: true,
        status: 200,
        ms: 50,
        checkedAt: NOW,
      },
    },
    NOW,
  )!;
  expect(report.switch!.health).toBe("ok");
  expect(report.ci!.health).toBe("idle");
  expect(report.storage!.lines[0]).toContain("Connect a GitHub repo");
  expect(report.storage).toBeDefined();
  expect(rackReport(project(), NOW)!.storage!.lines[0]).toBe(
    "Repo: 83 MB, last push 30 min ago",
  );
});

test("a linked repo GitHub couldn't read says why, instead of asking for a repo", () => {
  const limited = rackReport(
    project({
      activity: {
        ok: false,
        repo: "acme/app",
        fetchedAt: NOW,
        reason: "rate-limited",
        retryAt: NOW + 3_600_000,
      },
    }),
    NOW,
  )!;
  for (const unit of ["ci", "vm", "storage", "pdu"]) {
    expect(limited[unit]!.health).toBe("warn");
    expect(limited[unit]!.lines[0]).toStartWith(
      "GitHub’s hourly limit for this server was reached; back at",
    );
  }
});
