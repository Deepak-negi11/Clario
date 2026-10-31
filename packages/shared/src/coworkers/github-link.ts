// GitHub links in a coworker chat: when the learner pastes one, the server reads that public repo
// (README, file list, or the file linked) so the coworker can help with the code. Only the owner,
// repo, branch and path are taken from the link, each checked character by character, so the
// server only ever calls api.github.com with them.

export type GithubTarget = { owner: string; repo: string; kind: "repo" | "tree" | "blob"; ref?: string; path?: string };

const GITHUB_URL =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})(?:\/(tree|blob)\/([A-Za-z0-9._-]{1,100})((?:\/[A-Za-z0-9._@+-]{1,200}){0,20}))?/i;

export function parseGithubLink(text: string): GithubTarget | null {
  const match = GITHUB_URL.exec(text);
  if (!match) return null;
  const [, owner, rawRepo, kind, ref, rawPath] = match;
  const repo = rawRepo!.replace(/\.git$/i, "").replace(/[.,]+$/, "");
  if (!repo || repo === "." || repo === "..") return null;
  if (!kind) return { owner: owner!, repo, kind: "repo" };
  const segments = (rawPath ?? "").split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return { owner: owner!, repo, kind: "repo" };
  const path = segments.join("/");
  return { owner: owner!, repo, kind: kind.toLowerCase() as "tree" | "blob", ref, ...(path ? { path } : {}) };
}

/** The link in this message, else the most recent one the learner sent earlier in the chat. */
export function findGithubLink(message: string, history: { role: "user" | "coworker"; text: string }[]): GithubTarget | null {
  const current = parseGithubLink(message);
  if (current) return current;
  for (const turn of [...history].reverse()) {
    if (turn.role !== "user") continue;
    const earlier = parseGithubLink(turn.text);
    if (earlier) return earlier;
  }
  return null;
}

export const githubLabel = (target: GithubTarget) => `${target.owner}/${target.repo}${target.path ? `/${target.path}` : ""}`;
