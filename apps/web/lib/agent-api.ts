import { apiRequest } from "./api-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
// clario-agent's default server: the command only needs --api-url for any other one.
const LIVE_API = "https://api.clario.games";

/** Whether the user's Claude Code hook has reached the server. */
export function getAgentStatus(token: string) {
  return apiRequest<{ connected: boolean; connectedAt: string | null }>("/api/v1/agent-key", { token });
}

/** The user's agent key: always the same for them, and it can only post agent activity. */
export function createAgentKey(token: string) {
  return apiRequest<{ key: string }>("/api/v1/agent-key", { method: "POST", token });
}

/** Agents clario-agent can set up; Claude Code is its default. */
/** The terminal command that sets up clario-agent with this key, for every agent on the computer. */
export function agentSetupCommand(key: string) {
  const apiUrl = API_BASE_URL.replace(/\/+$/, "");
  return `npx clario-agent@latest setup --key ${key}${apiUrl === LIVE_API ? "" : ` --api-url ${apiUrl}`}`;
}
