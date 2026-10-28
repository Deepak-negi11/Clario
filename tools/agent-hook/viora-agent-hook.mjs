#!/usr/bin/env node
/**
 * Viora agent hook for Claude Code
 *
 * Broadcasts what your AI agent is doing to everyone in your current Viora space.
 * Setup guide: tools/agent-hook/README.md
 *
 * Reads Claude Code hook events from stdin and POSTs activity to
 * POST /api/v1/agent-activity on your Viora server. Exits 0 silently on any
 * failure so it never blocks your agent session.
 *
 * Sent: a short status line (tool name, edited file name, or the programs a shell
 * command runs, never its arguments) plus the project folder, git branch and short
 * commit. `"shareGit": false` in ~/.viora/agent.json (or VIORA_SHARE_GIT=0) keeps
 * project, branch and commit on this machine.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const CONFIG_PATH = join(homedir(), ".viora", "agent.json");
const THROTTLE_MS = 2000;
const STATE_PATH = join(homedir(), ".viora", ".agent-hook-state");

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => resolve(raw));
    setTimeout(() => resolve(raw), 1500);
  });
}

function loadConfig() {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (config?.token && config?.apiUrl) return config;
  } catch {
  }
  return null;
}

function lastSentAt() {
  try {
    return Number(readFileSync(STATE_PATH, "utf8")) || 0;
  } catch {
    return 0;
  }
}

// Git: project, branch and commit, read from .git directly (no git CLI).

/** Walk up from `start` to the first directory containing `.git` (a dir, or a file for worktrees). */
function findGitRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The repository's git dir. Throws if `.git` is missing or unreadable. */
function gitDirOf(gitRoot) {
  const gitDir = join(gitRoot, ".git");
  if (!statSync(gitDir).isFile()) return gitDir;
  // Worktrees and submodules: ".git" is a file containing "gitdir: <path>".
  const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitDir, "utf8"));
  return m ? resolve(gitRoot, m[1].trim()) : undefined;
}

/** A full commit id: 40 hex characters, or 64 in SHA-256 repositories. */
const COMMIT_RE = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

/** Branch and commit from HEAD. A detached HEAD has no branch; a repo with no commits has no commit. */
function readHead(gitRoot) {
  let gitDir;
  let head;
  try {
    gitDir = gitDirOf(gitRoot);
    head = gitDir && readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  } catch {
    return {};
  }
  if (!head) return {};
  if (COMMIT_RE.test(head)) return { commit: head };
  const ref = /^ref:\s*(refs\/heads\/(.+))$/.exec(head);
  return ref ? { branch: ref[2], commit: readRef(gitDir, ref[1]) } : {};
}

/** A branch's commit: loose ref first, then packed-refs. Linked worktrees keep both in the main git dir. */
function readRef(gitDir, name) {
  let commonDir = gitDir;
  try {
    commonDir = resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim());
  } catch {
    // Not a linked worktree.
  }
  let id;
  try {
    id = readFileSync(join(commonDir, name), "utf8").trim();
  } catch {
    try {
      for (const line of readFileSync(join(commonDir, "packed-refs"), "utf8").split("\n")) {
        const [sha, ref] = line.trim().split(" ");
        if (ref === name) id = sha;
      }
    } catch {
      // No packed-refs either: a repo with no commits yet.
    }
  }
  return id && COMMIT_RE.test(id) ? id : undefined;
}

/** Project folder, branch and short commit for the agent card; nothing when sharing is off. */
function gitInfo(event, config) {
  const env = process.env.VIORA_SHARE_GIT;
  if (env !== undefined ? env === "0" : config.shareGit === false) return {};
  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
  const root = findGitRoot(cwd);
  if (!root) return { project: basename(resolve(cwd)) };
  const { branch, commit } = readHead(root);
  return { project: basename(root), branch, commit: commit?.slice(0, 7) };
}

const WRAPPERS = new Set(["sudo", "env", "time", "nohup", "exec", "command"]);
const NOT_PROGRAMS = new Set(["cd", "export", "source", ".", "set", "unset"]);

/**
 * The programs a shell command runs ("bun", "git"), never its arguments: those can
 * hold tokens, passwords or private paths, and the status is shown to the whole space.
 */
function programNames(command) {
  const names = [];
  // First line only (skips heredoc bodies), and quoted strings removed, so a `;` or `|`
  // inside quotes can't turn quoted text into a "program".
  const line = command.split("\n")[0].replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
  for (const segment of line.split(/&&|\|\||[;|]/)) {
    const words = segment.trim().split(/\s+/);
    let i = 0;
    // Skip leading VAR=value, wrappers like sudo/env and their flags.
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i]) || words[i].startsWith("-"))) i++;
    if (!words[i] || NOT_PROGRAMS.has(words[i])) continue;
    const name = basename(words[i]);
    if (/^[A-Za-z0-9_.][A-Za-z0-9._+-]{0,23}$/.test(name) && !names.includes(name)) names.push(name);
  }
  return names.slice(0, 3);
}

function describe(event) {
  const tool = typeof event.tool_name === "string" ? event.tool_name : "";
  if (event.hook_event_name === "Stop") return { state: "done", text: "" };
  if (event.hook_event_name === "SessionEnd") return { state: "done", text: "" };

  const toolLabel = tool.replace(/^(mcp__|LambdaResponse)/, "").slice(0, 40);
  let detail = "";
  if (tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
    const filePath = event?.tool_input?.file_path;
    if (typeof filePath === "string") {
      const parts = filePath.split("/");
      detail = ` ${parts[parts.length - 1]}`;
    }
  }
  if (tool === "Bash" && typeof event?.tool_input?.command === "string") {
    const names = programNames(event.tool_input.command);
    if (names.length) detail = ` $ ${names.join(", ")}`;
  }
  return { state: "cooking", text: `Claude is using ${toolLabel || "a tool"}${detail}` };
}

async function main() {
  const config = loadConfig();
  if (!config) process.exit(0);

  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const { state, text } = describe(event);
  if (state === "cooking" && !text) process.exit(0);

  // Client-side throttle: hook events fire per tool use and can be chatty.
  const now = Date.now();
  if (state === "cooking" && now - lastSentAt() < THROTTLE_MS) process.exit(0);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/agent-activity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(state === "cooking" ? { text, state, ...gitInfo(event, config) } : { text, state }),
      signal: controller.signal,
    });
    if (state === "cooking") {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      try {
        mkdirSync(join(homedir(), ".viora"), { recursive: true });
        writeFileSync(STATE_PATH, String(now));
      } catch {
      }
    }
  } catch {
    // Never let analytics failures disturb the agent session.
  } finally {
    clearTimeout(timer);
  }

  process.exit(0);
}

main();
