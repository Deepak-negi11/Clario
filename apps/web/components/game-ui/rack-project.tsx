"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ExternalLink, GitFork, Star } from "lucide-react";
import type {
  RepoActivity,
  RepoItem,
  RepoItemKind,
  RepoItemStatus,
  SiteCheck,
  SpaceProject,
} from "@repo/shared";
import { getAuthToken } from "../../lib/auth-token";
import { getSpaceProject, saveSpaceProject } from "../../lib/space-api";

// The server rack's real feed: what the space's linked GitHub repo is doing and whether its website
// is up (from the API server, which reads and caches GitHub and checks the site), and the owner's
// form to connect them.

const REFRESH_MS = 60_000;
const SHOWN = 10;
const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const quiet = `inline-flex min-h-7 cursor-pointer items-center justify-center rounded-lg px-2 text-[11px] font-semibold text-white/90 transition hover:bg-black/20 hover:text-white motion-reduce:transition-none ${focus}`;
const primary = `inline-flex min-h-7 cursor-pointer items-center justify-center rounded-lg bg-[#3a6ee8] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#2f5ed0] disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${focus}`;
const field = `mt-1 block h-8 w-full rounded-lg bg-black/30 px-2 text-[12px] font-normal text-white ring-1 ring-white/30 placeholder:text-white/50 [text-shadow:none] ${focus}`;
const chip =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold";

// Which part of the rack each kind of item belongs to.
const UNIT: Record<RepoItemKind, string> = {
  run: "Build runner",
  deploy: "Deploy",
  pr: "Pull request",
  dependabot: "Security updates",
  issue: "Issue",
  release: "Release",
  commit: "Commit",
};
// The filter chips, in this order; only kinds the feed has are shown.
const GROUPS: [RepoItemKind, string][] = [
  ["run", "Builds"],
  ["deploy", "Deploys"],
  ["pr", "Pull requests"],
  ["dependabot", "Security"],
  ["issue", "Issues"],
  ["release", "Releases"],
  ["commit", "Commits"],
];
const STATUS: Record<RepoItemStatus, [string, string]> = {
  running: ["Running", "bg-[#3a6ee8]"],
  passed: ["Passed", "bg-[#2f8f5b]"],
  failed: ["Failed", "bg-[#c0573f]"],
  cancelled: ["Cancelled", "bg-black/30"],
  replaced: ["Replaced", "bg-black/30"],
  open: ["Open", "bg-[#2f8f5b]"],
  merged: ["Merged", "bg-[#8a5cd0]"],
  closed: ["Closed", "bg-black/30"],
  released: ["Released", "bg-[#3a6ee8]"],
  pushed: ["Pushed", "bg-black/30"],
  unknown: ["No status", "bg-black/30"],
};

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (at: number) =>
  new Date(at).toLocaleDateString([], { day: "numeric", month: "short" });
function when(at: number, now: number) {
  return new Date(at).toDateString() === new Date(now).toDateString()
    ? clock(at)
    : day(at);
}
function ago(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}
const compact = (value: number) =>
  new Intl.NumberFormat([], { notation: "compact" }).format(value);

type Changes = { link?: string | null; website?: string | null };

/** The space's project, loaded while the panel is open and refreshed every minute. */
export function useRackProject(spaceId: string | undefined, open: boolean) {
  const [project, setProject] = useState<SpaceProject | null>(null);
  const [problem, setProblem] = useState("");
  const version = useRef(0);
  // An answer that arrives after a newer one, a save, or the panel closing is dropped.
  const load = useCallback(
    async (live: () => boolean) => {
      const token = getAuthToken();
      if (!spaceId || !token) return;
      const mine = ++version.current;
      const current = () => mine === version.current && live();
      try {
        const next = await getSpaceProject(token, spaceId);
        if (!current()) return;
        setProject(next);
        setProblem("");
      } catch (error) {
        if (!current()) return;
        // A refusal (say, after leaving the space) hides what was shown; a network blip keeps it.
        if (!(error instanceof TypeError)) setProject(null);
        // fetch() itself failing (a TypeError) means the server couldn't be reached.
        setProblem(
          error instanceof Error && !(error instanceof TypeError)
            ? error.message
            : "Couldn’t reach the server. Trying again in a minute.",
        );
      }
    },
    [spaceId],
  );
  useEffect(() => {
    if (!open) return;
    let live = true;
    void load(() => live);
    const timer = window.setInterval(() => void load(() => live), REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      live = false;
    };
  }, [open, load]);
  // An error message, or "" once saved.
  const save = async (changes: Changes) => {
    const token = getAuthToken();
    if (!spaceId || !token) return "Sign in again to connect a project.";
    try {
      const next = await saveSpaceProject(token, spaceId, changes);
      version.current++;
      setProject(next);
      setProblem("");
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Couldn't save it";
    }
  };
  return { project, problem, save };
}

function Status({ status }: { status: RepoItemStatus }) {
  const [label, tone] = STATUS[status];
  return (
    <span className={`${chip} ${tone}`}>
      {status === "running" && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

function Row({
  href,
  title,
  detail,
  badge,
  at,
  now,
  site,
}: {
  href: string;
  title: string;
  detail: string;
  badge: ReactNode;
  at: number;
  now: number;
  site: string;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex items-start gap-2 rounded-lg bg-black/20 px-2 py-1.5 transition hover:bg-black/30 motion-reduce:transition-none ${focus}`}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold">
            <span className="truncate">{title}</span>
            <ExternalLink
              size={10}
              className="shrink-0 opacity-0 transition group-hover:opacity-80 group-focus-visible:opacity-80"
              aria-hidden="true"
            />
          </p>
          <p className="truncate text-[10px] text-white/85">{detail}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {badge}
          <time
            dateTime={new Date(at).toISOString()}
            className="text-[9px] tabular-nums text-white/70"
          >
            {when(at, now)}
          </time>
        </div>
        <span className="sr-only"> (opens {site} in a new tab)</span>
      </a>
    </li>
  );
}

/** The health check: whether the project's website answered. */
export function SiteRow({ site, now }: { site: SiteCheck; now: number }) {
  const host = new URL(site.url).hostname;
  const detail = site.up
    ? [
        site.status,
        site.ms !== undefined && `${site.ms} ms`,
        site.certExpiresAt &&
          `certificate until ${day(Date.parse(site.certExpiresAt))}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : (site.problem ?? "It didn’t answer");
  return (
    <Row
      href={site.url}
      title={host}
      detail={`Health check · ${detail}`}
      badge={
        <span
          className={`${chip} ${site.up ? "bg-[#2f8f5b]" : "bg-[#c0573f]"}`}
        >
          {site.up ? "Up" : "Down"}
        </span>
      }
      at={site.checkedAt}
      now={now}
      site="the website"
    />
  );
}

/** The header's right side: the repo and how fresh its data is. */
export function ProjectLabel({
  activity,
  now,
}: {
  activity: RepoActivity;
  now: number;
}) {
  return (
    <span className="min-w-0 truncate text-[9px] text-white/80">
      <a
        href={`https://github.com/${activity.repo}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`font-semibold text-white underline-offset-2 hover:underline ${focus}`}
      >
        {activity.repo}
      </a>
      {" · "}
      {activity.ok ? "updated" : "checked"} {ago(activity.fetchedAt, now)}
    </span>
  );
}

function Overview({
  activity,
  now,
}: {
  activity: Extract<RepoActivity, { ok: true }>;
  now: number;
}) {
  const { overview } = activity;
  const facts = [
    overview.language,
    overview.license,
    overview.defaultBranch && `${overview.defaultBranch} branch`,
    `pushed ${ago(Date.parse(overview.pushedAt), now)}`,
  ].filter(Boolean);
  return (
    <div className="mb-1.5 rounded-lg bg-black/20 px-2 py-1.5">
      {overview.description && (
        <p className="truncate text-[10px] text-white/90">
          {overview.description}
        </p>
      )}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/85">
        <span className="inline-flex items-center gap-0.5">
          <Star size={10} aria-hidden="true" />
          {compact(overview.stars)}
          <span className="sr-only"> stars</span>
        </span>
        <span className="inline-flex items-center gap-0.5">
          <GitFork size={10} aria-hidden="true" />
          {compact(overview.forks)}
          <span className="sr-only"> forks</span>
        </span>
        <span>{compact(overview.openIssues)} open issues and PRs</span>
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </p>
    </div>
  );
}

export function ProjectFeed({
  activity,
  site,
  now,
  unit = null,
  onClearUnit,
}: {
  activity: RepoActivity;
  site: SiteCheck | null;
  now: number;
  // A rack unit picked in the panel: only the rows it stands for ("site" is the health check).
  unit?: { name: string; kinds: (RepoItemKind | "site")[] } | null;
  onClearUnit?: () => void;
}) {
  const [filter, setFilter] = useState<RepoItemKind | "all">("all");
  if (!activity.ok) {
    const text =
      activity.reason === "rate-limited"
        ? `GitHub’s hourly limit for this server was reached. Trying again at ${clock(activity.retryAt ?? now + 60_000)}.`
        : activity.reason === "not-found"
          ? `${activity.repo} wasn’t found. It may be private or renamed; only public repos can be shown.`
          : "GitHub isn’t answering right now. Trying again in a minute.";
    return (
      <>
        <p
          role="status"
          className="mb-1 rounded-lg bg-black/20 px-2 py-2 text-[11px] leading-4 text-white/90"
        >
          {text}
        </p>
        {site && (
          <ol className="grid grid-cols-1 gap-1">
            <SiteRow site={site} now={now} />
          </ol>
        )}
      </>
    );
  }
  const groups = GROUPS.filter(([kind]) =>
    activity.items.some((item) => item.kind === kind),
  );
  const shown = activity.items
    .filter((item) =>
      unit
        ? unit.kinds.includes(item.kind)
        : filter === "all" || item.kind === filter,
    )
    .slice(0, SHOWN);
  const showSite =
    !!site && (unit ? unit.kinds.includes("site") : filter === "all");
  return (
    <>
      {activity.stale && (
        <p
          role="status"
          className="mb-1.5 rounded-lg bg-[#f2c14e]/25 px-2 py-1 text-[10px] leading-4 text-white"
        >
          {activity.stale.reason === "rate-limited"
            ? "GitHub’s hourly limit for this server was reached"
            : "GitHub isn’t answering right now"}
          , so this is from {ago(activity.fetchedAt, now)}.
          {activity.stale.retryAt
            ? ` Next try at ${clock(activity.stale.retryAt)}.`
            : " Trying again shortly."}
        </p>
      )}
      <Overview activity={activity} now={now} />
      {unit && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md bg-[#3a6ee8]/40 px-2 py-1 text-[10px] font-semibold">
          <span className="truncate">
            Showing the {unit.name.toLowerCase()}’s rows
          </span>
          <button
            type="button"
            onClick={onClearUnit}
            className={`shrink-0 cursor-pointer rounded px-1 underline-offset-2 hover:underline ${focus}`}
          >
            Show all
          </button>
        </div>
      )}
      {!unit && groups.length > 1 && (
        <div
          role="group"
          aria-label="Show"
          className="mb-1.5 flex flex-wrap gap-1"
        >
          {[["all", "All"] as const, ...groups].map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
              className={`min-h-6 cursor-pointer rounded-md px-1.5 text-[10px] font-semibold transition motion-reduce:transition-none ${filter === kind ? "bg-[#3a6ee8] text-white" : "bg-black/20 text-white/85 hover:bg-black/30"} ${focus}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <ol
        aria-label="Recent project activity"
        className="grid grid-cols-1 gap-1"
      >
        {showSite && <SiteRow site={site!} now={now} />}
        {shown.map((item: RepoItem) => (
          <Row
            key={item.id}
            href={item.url}
            title={item.title}
            detail={`${UNIT[item.kind]}${item.detail ? ` · ${item.detail}` : ""}`}
            badge={<Status status={item.status} />}
            at={Date.parse(item.at)}
            now={now}
            site="GitHub"
          />
        ))}
        {!shown.length && !showSite && (
          <li className="rounded-lg bg-black/20 px-2 py-2 text-[11px] text-white/90">
            Nothing recent here yet.
          </li>
        )}
      </ol>
    </>
  );
}

/** "Connect your project" for the owner, or a note for everyone else. */
export function ConnectProject({
  project,
  save,
}: {
  project: SpaceProject;
  save: (changes: Changes) => Promise<string>;
}) {
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = !!(project.repo || project.website);
  if (!project.canEdit)
    return linked ? null : (
      <p className="mt-2 text-[10px] text-white/80">
        The space owner can connect a project to show its real builds, deploys
        and website.
      </p>
    );
  const homepage =
    project.activity?.ok && project.activity.overview.homepage
      ? new URL(project.activity.overview.homepage).hostname
      : null;
  const submit = async (changes: Changes) => {
    setBusy(true);
    const problem = await save(changes);
    setBusy(false);
    setError(problem);
    if (!problem) setEditing(false);
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setEditing(false);
  };
  if (!editing)
    return (
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          className={linked ? quiet : primary}
          onClick={() => {
            setLink(project.repo ? `https://github.com/${project.repo}` : "");
            setWebsite(project.website ?? "");
            setError("");
            setEditing(true);
          }}
        >
          {linked ? "Change project" : "Connect your project"}
        </button>
        {!linked && (
          <span className="text-[10px] text-white/80">
            Show your repo’s real builds, deploys and website
          </span>
        )}
      </div>
    );
  return (
    <form
      className="mt-2 grid gap-1.5 rounded-lg bg-black/20 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({
          link: link.trim() || null,
          website: website.trim() || null,
        });
      }}
    >
      <label className="text-[10px] font-semibold">
        Public GitHub repo
        <input
          autoFocus
          value={link}
          maxLength={300}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={escape}
          placeholder="https://github.com/owner/repo"
          spellCheck={false}
          className={field}
        />
      </label>
      <label className="text-[10px] font-semibold">
        Website to check{" "}
        <span className="font-normal opacity-80">(optional)</span>
        <input
          value={website}
          maxLength={300}
          onChange={(event) => setWebsite(event.target.value)}
          onKeyDown={escape}
          placeholder={
            homepage
              ? `Empty: the repo’s site, ${homepage}`
              : "https://your-site.com"
          }
          spellCheck={false}
          inputMode="url"
          className={field}
        />
      </label>
      {error && (
        <p role="alert" className="text-[10px] text-[#ffb4a6]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="submit"
          className={primary}
          disabled={busy || (!link.trim() && !website.trim() && !linked)}
        >
          {busy ? "Checking…" : "Save"}
        </button>
        <button
          type="button"
          className={quiet}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
        {linked && (
          <button
            type="button"
            className={`${quiet} ml-auto`}
            disabled={busy}
            onClick={() => void submit({ link: null, website: null })}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
