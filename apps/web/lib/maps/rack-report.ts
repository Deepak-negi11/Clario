// What each unit of the server rack means for the space's own project, when one is linked: its
// lights and a few plain lines from the real data (GitHub and the website check), and which part
// of the feed it stands for. The rack itself stays a typical one (server-rack.ts).

import type { RepoItem, RepoItemKind, SpaceProject } from "@repo/shared";

export type UnitHealth = "ok" | "busy" | "warn" | "fail" | "idle";
export type UnitReport = { health: UnitHealth; lines: string[] };

// The feed rows each unit stands for ("site" is the website's health check); null shows them all.
export const UNIT_FEED: Record<string, (RepoItemKind | "site")[] | null> = {
  switch: ["site"],
  patch: null,
  firewall: ["site", "dependabot"],
  ci: ["run"],
  vm: ["deploy"],
  blank: null,
  storage: ["commit", "release"],
  ups: ["site"],
  pdu: ["run", "deploy"],
};

const DAY = 86_400_000;
const LABEL: Record<RepoItem["status"], string> = {
  running: "running",
  passed: "passed",
  failed: "failed",
  cancelled: "cancelled",
  replaced: "replaced",
  open: "open",
  merged: "merged",
  closed: "closed",
  released: "released",
  pushed: "pushed",
  unknown: "no status yet",
};
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function since(at: number, now: number) {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  const days = Math.round(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function size(kb: number) {
  return kb >= 1024 * 1024
    ? `${(kb / 1024 / 1024).toFixed(1)} GB`
    : kb >= 1024
      ? `${Math.round(kb / 1024)} MB`
      : `${kb} KB`;
}

/** Each unit's report, or null when nothing is linked (the rack then shows its usual lights). */
export function rackReport(
  project: SpaceProject | null,
  now: number,
): Record<string, UnitReport> | null {
  if (!project || (!project.repo && !project.site)) return null;
  const activity = project.activity?.ok ? project.activity : null;
  const items = activity?.items ?? [];
  const site = project.site;
  const host = site ? new URL(site.url).hostname : null;
  const of = (kind: RepoItemKind) => items.filter((item) => item.kind === kind);
  const report: Record<string, UnitReport> = {};
  // A unit that needs GitHub: why it has nothing to show. A linked repo GitHub couldn't read is
  // said so (and needs a look), rather than asking for a repo again.
  const failed =
    project.activity && !project.activity.ok ? project.activity : null;
  const waiting = (what: string): UnitReport => {
    if (!failed)
      return {
        health: "idle",
        lines: [`Connect a GitHub repo to see ${what}`],
      };
    const back = failed.retryAt
      ? `; back at ${new Date(failed.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "";
    return {
      health: "warn",
      lines: [
        failed.reason === "rate-limited"
          ? `GitHub’s hourly limit for this server was reached${back}`
          : failed.reason === "not-found"
            ? "GitHub can’t find this repo: it may be private or renamed"
            : "GitHub isn’t answering right now",
      ],
    };
  };

  report.switch = site
    ? {
        health: site.up ? "ok" : "fail",
        lines: [
          site.up
            ? `${host} answered (${site.status}) in ${site.ms} ms`
            : `${host}: ${site.problem ?? "it didn’t answer"}`,
        ],
      }
    : {
        health: "idle",
        lines: [
          "No website to reach yet. The owner can add one with Change project.",
        ],
      };

  report.patch = {
    health: "ok",
    lines: [
      project.repo && `GitHub: ${project.repo}`,
      host && `Website: ${host}`,
      activity?.overview.defaultBranch &&
        `Main branch: ${activity.overview.defaultBranch}`,
    ].filter((line): line is string => !!line),
  };

  const updates = of("dependabot").filter(
    (item) => item.status === "open",
  ).length;
  const days = site?.certExpiresAt
    ? Math.floor((Date.parse(site.certExpiresAt) - now) / DAY)
    : null;
  const certProblem =
    site && !site.up && /certificate/i.test(site.problem ?? "");
  report.firewall = {
    health: certProblem
      ? "fail"
      : days !== null && days < 14
        ? "warn"
        : site || activity
          ? "ok"
          : "idle",
    lines: [
      certProblem
        ? (site!.problem ?? "")
        : days !== null
          ? `HTTPS certificate: ${plural(days, "day")} left`
          : site
            ? ""
            : "No website, so no certificate to check",
      activity
        ? updates
          ? `${plural(updates, "open Dependabot update")} waiting`
          : "No open Dependabot updates in recent pull requests"
        : "",
    ].filter(Boolean),
  };

  const runs = of("run");
  const count = (status: RepoItem["status"]) =>
    runs.filter((run) => run.status === status).length;
  report.ci = runs.length
    ? {
        health:
          runs[0]!.status === "failed"
            ? "fail"
            : count("running")
              ? "busy"
              : "ok",
        lines: [
          `Last ${plural(runs.length, "run")}: ${[count("passed") && `${count("passed")} passed`, count("failed") && `${count("failed")} failed`, count("running") && `${count("running")} running`].filter(Boolean).join(" · ") || "none finished"}`,
          `Newest: ${runs[0]!.title}, ${LABEL[runs[0]!.status]}`,
        ],
      }
    : activity
      ? { health: "idle", lines: ["No recent GitHub Actions runs"] }
      : waiting("its builds");

  const deploys = of("deploy");
  const latest = deploys[0];
  report.vm = latest
    ? {
        health:
          latest.status === "failed"
            ? "fail"
            : latest.status === "running"
              ? "busy"
              : "ok",
        lines: [
          `Newest: ${latest.title}, ${LABEL[latest.status]} ${since(Date.parse(latest.at), now)}`,
        ],
      }
    : activity
      ? {
          health: "idle",
          lines: [
            "No GitHub deployments for this repo. Many teams deploy from outside GitHub.",
          ],
        }
      : waiting("its deploys");

  report.blank = {
    health: "idle",
    lines: ["An empty slot, with room for another server"],
  };

  const release = of("release")[0];
  report.storage = activity
    ? {
        health: "ok",
        lines: [
          `Repo: ${size(activity.overview.sizeKb)}, last push ${since(Date.parse(activity.overview.pushedAt), now)}`,
          release ? `Newest release: ${release.title}` : "No releases yet",
        ],
      }
    : waiting("its code and releases");

  const history =
    site?.history ?? (site ? [{ at: site.checkedAt, up: site.up }] : []);
  const up = history.filter((check) => check.up).length;
  report.ups = site
    ? {
        health: !site.up ? "fail" : up < history.length ? "warn" : "ok",
        lines: [
          `Website up in ${up} of the last ${plural(history.length, "check")}`,
        ],
      }
    : { health: "idle", lines: ["No website to keep an eye on yet"] };

  const running = items.filter(
    (item) =>
      item.status === "running" &&
      (item.kind === "run" || item.kind === "deploy"),
  ).length;
  report.pdu = activity
    ? {
        health: running ? "busy" : "ok",
        lines: [
          running
            ? `Busy: ${plural(running, "build or deploy", "builds and deploys")} running`
            : "Nothing running right now",
          `${activity.overview.openIssues} open issues and pull requests`,
        ],
      }
    : waiting("what is running");

  return report;
}
