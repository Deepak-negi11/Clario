export const AGENT_KINDS = ["claude-code", "codex", "cursor-agent"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];
export type AgentIdentity = AgentKind | "agent";

export const AGENT_IDENTITY = {
  "claude-code": {
    name: "Claude Code",
    short: "Claude",
    color: "#b65c3e",
    wash: "#fbefe7",
    border: "#ecd9cc",
    file: "claude",
  },
  codex: {
    name: "Codex",
    short: "Codex",
    color: "#5755c9",
    wash: "#f0efff",
    border: "#deddf5",
    file: "codex",
  },
  "cursor-agent": {
    name: "Cursor",
    short: "Cursor",
    color: "#41414b",
    wash: "#f1f0f5",
    border: "#dfdce8",
    file: "cursor",
  },
  agent: {
    name: "Coding agent",
    short: "Agent",
    color: "#64716d",
    wash: "#f2f5f2",
    border: "#dde5dd",
    file: "agent",
  },
} as const;

// Missing identity belongs to older Claude hooks. Unexpected input gets a neutral identity.
export function agentKind(value?: string | null): AgentIdentity {
  if (!value || value === "claude" || value === "claude-code")
    return "claude-code";
  if (value === "codex") return "codex";
  if (value === "cursor" || value === "cursor-agent") return "cursor-agent";
  return "agent";
}

export function agentArtPath(kind: AgentIdentity, working = false) {
  return `/assets/agents/${AGENT_IDENTITY[kind].file}${working ? "-working" : ""}.svg`;
}

export function agentCompanionTexturePath(kind: AgentIdentity) {
  if (kind === "codex") return "/assets/agents/codex-pet.png";
  return agentArtPath(kind);
}
