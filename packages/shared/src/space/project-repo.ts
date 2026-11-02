// A team's own public GitHub project, linked to their space by its owner. The server rack panel
// shows what that repo is doing (Actions runs, deployments, pull requests, issues, releases,
// commits) and an overview of it, read by the API server from api.github.com and cached there,
// plus whether the project's website is up (checked by the API server). Later steps (private
// repos through a GitHub App, webhooks) can add item kinds without changing these shapes.

import { parseGithubLink } from "../coworkers/github-link";

export type ProjectRepo = { owner: string; repo: string };

/** "owner/repo" from a pasted GitHub link (or a bare "owner/repo"), each part checked. */
export function parseProjectRepo(text: string): ProjectRepo | null {
  const value = text.trim();
  if (!value || value.length > 300) return null;
  const link = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/.test(value) ? `https://github.com/${value}` : value;
  const target = parseGithubLink(link);
  return target ? { owner: target.owner, repo: target.repo } : null;
}

export const projectRepoLabel = (repo: ProjectRepo) => `${repo.owner}/${repo.repo}`;

/**
 * A project website to check: https only, on the default port, with no user name or password.
 * Returns the URL to fetch (origin and path), or null. The server also refuses private addresses.
 */
export function parseSiteUrl(text: string): string | null {
  const value = text.trim();
  if (!value || value.length > 300 || /[\s\u0000-\u001f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  // A real public name ("example.com"), not "localhost" or a bare word.
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)) return null;
  return `${url.origin}${url.pathname}`;
}

export type RepoItemKind = "run" | "deploy" | "pr" | "dependabot" | "issue" | "release" | "commit";
export type RepoItemStatus =
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "replaced"
  | "open"
  | "merged"
  | "closed"
  | "released"
  | "pushed"
  | "unknown";

export type RepoItem = {
  kind: RepoItemKind;
  id: string;
  title: string;
  // Branch, environment, author or short commit id.
  detail: string;
  status: RepoItemStatus;
  // ISO time.
  at: string;
  // Always a https://github.com/ page.
  url: string;
};

// The repo at a glance, from its GitHub page.
export type RepoOverview = {
  description: string;
  stars: number;
  forks: number;
  // Open issues and pull requests together, as GitHub counts them.
  openIssues: number;
  language: string;
  license: string;
  defaultBranch: string;
  pushedAt: string;
  // The repo's website field, when it is a URL parseSiteUrl accepts.
  homepage: string | null;
  // The repo's size on GitHub, in kilobytes.
  sizeKb: number;
};

export type RepoActivity =
  | {
      ok: true;
      repo: string;
      fetchedAt: number;
      overview: RepoOverview;
      items: RepoItem[];
      // Set when this is an older answer, shown because GitHub couldn't be read just now.
      stale?: { reason: "rate-limited" | "unavailable"; retryAt?: number };
    }
  | { ok: false; repo: string; fetchedAt: number; reason: "not-found" | "rate-limited" | "unavailable"; retryAt?: number };

// Whether the project's website answered: an HTTPS request to it, from the API server.
export type SiteCheck = {
  url: string;
  up: boolean;
  // HTTP status, time to the first line of the answer, and when its certificate expires.
  status?: number;
  ms?: number;
  certExpiresAt?: string;
  // Why it is down, in plain words.
  problem?: string;
  checkedAt: number;
  // This server's recent checks of the site, oldest first, this one last (at most 12). A check is
  // made at most every few minutes, and only while someone has the panel open.
  history?: { at: number; up: boolean; ms?: number }[];
};

// GET /api/v1/space/:spaceId/project. `website` is the one the owner set; without it the site
// checked is the repo's own website field.
export type SpaceProject = {
  repo: string | null;
  website: string | null;
  canEdit: boolean;
  activity: RepoActivity | null;
  site: SiteCheck | null;
};
