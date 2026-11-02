import prisma from "@repo/db";
import { parseProjectRepo, parseSiteUrl, projectRepoLabel, type RepoActivity, type SiteCheck, type SpaceProject } from "@repo/shared";
import { requireAuth } from "../middleware/auth";
import { jsonMessage } from "../utils/http";
import { isUserOnline } from "../ws/presence";
import { repoActivity } from "./github-activity";
import { siteChecker } from "./site-check";

// The team's project for the server rack panel. The space's owner (or an admin) links a public
// GitHub repo and, if they like, the project's website; everyone in the space sees what the repo
// is doing and whether the site is up (the repo's own website field is checked when none is set).

type Reader = { read: typeof repoActivity.read };
type Checker = { check: typeof siteChecker.check };
let reader: Reader = repoActivity;
let checker: Checker = siteChecker;

/** Tests swap in a mocked GitHub and website check. */
export function setRepoActivityReader(next: Reader) {
  reader = next;
}
export function setSiteChecker(next: Checker) {
  checker = next;
}

// /api/v1/space/:spaceId/project
function spaceIdFrom(req: Request) {
  return new URL(req.url).pathname.split("/")[4] ?? "";
}

async function access(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  const spaceId = spaceIdFrom(req);
  const [space, user] = await Promise.all([
    prisma.space.findUnique({ where: { id: spaceId }, select: { creatorId: true, githubRepo: true, websiteUrl: true } }),
    prisma.user.findUnique({ where: { id: auth.userId }, select: { role: true } }),
  ]);
  if (!space) return jsonMessage("Space not found", 404);
  const canEdit = space.creatorId === auth.userId || user?.role === "Admin";
  return { spaceId, userId: auth.userId, space, canEdit };
}

async function project(repo: string | null, website: string | null, canEdit: boolean, known?: RepoActivity | null): Promise<SpaceProject> {
  const target = repo ? parseProjectRepo(repo) : null;
  const activity = known !== undefined ? known : target ? await reader.read(target) : null;
  const url = (website && parseSiteUrl(website)) || (activity?.ok ? activity.overview.homepage : null);
  const site: SiteCheck | null = url ? await checker.check(url) : null;
  return { repo, website, canEdit, activity, site };
}

// GET -> SpaceProject. Only people in the space (or its owner) can see it.
export async function handleGetProject(req: Request): Promise<Response> {
  const found = await access(req);
  if (found instanceof Response) return found;
  const { spaceId, userId, space, canEdit } = found;
  if (!canEdit && !(await isUserOnline(spaceId, userId))) return jsonMessage("Join the space to see its project", 403);
  return Response.json(await project(space.githubRepo, space.websiteUrl, canEdit));
}

// PUT, body { link?: string | null, website?: string | null } -> SpaceProject. Only the fields
// sent change; an empty one removes it.
export async function handleSaveProject(req: Request): Promise<Response> {
  const found = await access(req);
  if (found instanceof Response) return found;
  const { spaceId, space, canEdit } = found;
  if (!canEdit) return jsonMessage("Only the space's owner can connect a project", 403);

  const body = (await req.json().catch(() => null)) as { link?: unknown; website?: unknown } | null;
  const sent = (value: unknown) => value === undefined || value === null || typeof value === "string";
  if (!body || (body.link === undefined && body.website === undefined) || !sent(body.link) || !sent(body.website)) {
    return jsonMessage("Send a link, a website, or both");
  }

  let repo = space.githubRepo;
  let activity: RepoActivity | null | undefined;
  if (body.link !== undefined) {
    const link = typeof body.link === "string" ? body.link.trim() : "";
    repo = null;
    activity = null;
    if (link) {
      const target = parseProjectRepo(link);
      if (!target) return jsonMessage("Paste a GitHub repo link, like https://github.com/owner/repo");
      activity = await reader.read(target);
      // Rate limits and GitHub outages don't stop saving; a repo GitHub says isn't there does.
      if (!activity.ok && activity.reason === "not-found") return jsonMessage(`${projectRepoLabel(target)} wasn't found. Only public repos can be connected for now.`, 404);
      repo = projectRepoLabel(target);
    }
  }
  let website = space.websiteUrl;
  if (body.website !== undefined) {
    const text = typeof body.website === "string" ? body.website.trim() : "";
    website = text ? parseSiteUrl(text) : null;
    if (text && !website) return jsonMessage("Enter the website as https://your-site.com (https, no port)");
  }

  await prisma.space.update({ where: { id: spaceId }, data: { githubRepo: repo, websiteUrl: website } });
  return Response.json(await project(repo, website, canEdit, activity));
}
