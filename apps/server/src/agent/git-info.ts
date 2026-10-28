// Project, branch and commit sent by the agent hook next to the activity text.
// Untrusted input that everyone in the space sees, so anything that doesn't fit is
// dropped (never stored half-cleaned) and the activity itself still goes through.

export type AgentGitInfo = { project?: string; branch?: string; commit?: string };

const MAX_PROJECT_LENGTH = 80;
const MAX_BRANCH_LENGTH = 120;
// A short or full commit id (SHA-1 or SHA-256); only the first 7 characters are kept.
const COMMIT_RE = /^[a-f0-9]{7,64}$/;

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  // Control characters and bidi overrides could break or disguise the card's text.
  const text = value.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").trim();
  return text && text.length <= max ? text : undefined;
}

export function parseAgentGitInfo(body: Record<string, unknown>): AgentGitInfo {
  const info: AgentGitInfo = {};
  const project = cleanText(body.project, MAX_PROJECT_LENGTH);
  const branch = cleanText(body.branch, MAX_BRANCH_LENGTH);
  if (project) info.project = project;
  if (branch) info.branch = branch;
  if (typeof body.commit === "string" && COMMIT_RE.test(body.commit)) info.commit = body.commit.slice(0, 7);
  return info;
}
