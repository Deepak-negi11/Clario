#!/usr/bin/env node
/**
 * Clario agent hook for Claude Code, Codex and Cursor
 *
 * Broadcasts what your AI agent is doing to everyone in your current Clario space.
 * Setup guide: tools/agent-hook/README.md
 *
 *   node hook.mjs [--agent claude-code|codex|cursor-agent]   (hook JSON on stdin)
 *
 * Reads the agent's hook events from stdin and POSTs activity to
 * POST /api/v1/agent-activity on your Clario server. Exits 0 silently on any
 * failure so it never blocks your agent session. Without --agent it's Claude Code.
 *
 * Sent: a short status line (tool name, edited file name, or the programs a shell
 * command runs, never its arguments), which agent it is, and the project folder,
 * git branch and short commit. `"shareGit": false` in ~/.clario/agent.json (or
 * CLARIO_SHARE_GIT=0) keeps project, branch and commit on this machine.
 *
 * Codex and Cursor read their hooks from one file for every project, so for them this
 * only reports from the projects setup was run in (`projects` in the config), unless
 * setup was run with --global (`everyProject`). Cursor reads each hook's stdout as its
 * reply, so it always gets the neutral one: carry on, change nothing.
 */

import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

const DIR = process.env.CLARIO_HOME || join(homedir(), ".clario");
const CONFIG_PATH = join(DIR, "agent.json");
const THROTTLE_MS = 2000;
const statePath = (agent) => join(DIR, `.agent-hook-state-${agent}`);

/** Agents this hook understands, by the --agent value setup registers, with the name shown in Clario. */
const AGENTS = {
  "claude-code": "Claude",
  codex: "Codex",
  "cursor-agent": "Cursor",
};

function agentFromArgs(argv) {
  const i = argv.indexOf("--agent");
  const value =
    i > -1
      ? argv[i + 1]
      : argv.find((a) => a.startsWith("--agent="))?.slice("--agent=".length);
  return value in AGENTS ? value : "claude-code";
}

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
    // agentKey (from setup) wins over a pasted 7-day login token.
    const credential = config?.agentKey || config?.token;
    if (credential && config?.apiUrl) return { ...config, credential };
  } catch {}
  return null;
}

function lastSentAt(agent) {
  try {
    return Number(readFileSync(statePath(agent), "utf8")) || 0;
  } catch {
    return 0;
  }
}

/** Working directory of a hook event. Claude Code and Codex send `cwd`; Cursor sends `workspace_roots`. */
function eventCwd(event) {
  const roots = Array.isArray(event.workspace_roots)
    ? event.workspace_roots.filter((r) => typeof r === "string" && r)
    : [];
  return (
    (typeof event.cwd === "string" && event.cwd) ||
    roots[0] ||
    process.env.CURSOR_PROJECT_DIR ||
    process.cwd()
  );
}

function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Codex and Cursor: only from the projects setup was run in, or every project after setup --global. */
function sharedHere(config, agent, cwd) {
  if (agent === "claude-code" || config.everyProject === true) return true; // Claude Code's hook is per project already
  const here = realPath(cwd);
  const projects = Array.isArray(config.projects) ? config.projects : [];
  return projects.some(
    (p) =>
      typeof p === "string" &&
      (here === p || here.startsWith(p.endsWith(sep) ? p : p + sep)),
  );
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
    commonDir = resolve(
      gitDir,
      readFileSync(join(gitDir, "commondir"), "utf8").trim(),
    );
  } catch {
    // Not a linked worktree.
  }
  let id;
  try {
    id = readFileSync(join(commonDir, name), "utf8").trim();
  } catch {
    try {
      for (const line of readFileSync(
        join(commonDir, "packed-refs"),
        "utf8",
      ).split("\n")) {
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
function gitInfo(cwd, config) {
  const env = process.env.CLARIO_SHARE_GIT;
  if (env !== undefined ? env === "0" : config.shareGit === false) return {};
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
  const line = command
    .split("\n")[0]
    .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
  for (const segment of line.split(/&&|\|\||[;|]/)) {
    const words = segment.trim().split(/\s+/);
    let i = 0;
    // Skip leading VAR=value, wrappers like sudo/env and their flags.
    while (
      i < words.length &&
      (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) ||
        WRAPPERS.has(words[i]) ||
        words[i].startsWith("-"))
    )
      i++;
    if (!words[i] || NOT_PROGRAMS.has(words[i])) continue;
    const name = basename(words[i]);
    if (
      /^[A-Za-z0-9_.][A-Za-z0-9._+-]{0,23}$/.test(name) &&
      !names.includes(name)
    )
      names.push(name);
  }
  return names.slice(0, 3);
}

/** A shell tool's command line. Codex often sends it as ["bash", "-lc", "the command"]. */
function commandText(input) {
  const command = input?.command ?? input?.cmd;
  if (typeof command === "string") return command;
  if (
    !Array.isArray(command) ||
    !command.every((part) => typeof part === "string")
  )
    return "";
  const flag = command.findIndex((part) => part === "-c" || part === "-lc");
  return flag > -1 && command[flag + 1] ? command[flag + 1] : command.join(" ");
}

/** The first file a Codex apply_patch names ("*** Update File: path"), wherever the patch sits in the input. */
function patchFile(value, depth = 0) {
  if (depth > 3 || value == null) return undefined;
  if (typeof value === "string")
    return /^\*\*\* (?:Update|Add|Delete) File:\s*(.+?)\s*$/m.exec(value)?.[1];
  const values = Array.isArray(value)
    ? value
    : typeof value === "object"
      ? Object.values(value)
      : [];
  for (const v of values) {
    const found = patchFile(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}

const fileName = (path) =>
  typeof path === "string" && path.trim() ? basename(path.trim()) : "";

const DONE_EVENTS = new Set(["Stop", "SessionEnd", "stop", "sessionEnd"]);
const PROMPT_EVENTS = new Set(["UserPromptSubmit", "beforeSubmitPrompt"]);
const EDIT_TOOLS = new Set(["edit", "write", "multiedit", "notebookedit"]);
const PATCH_TOOLS = new Set(["apply_patch", "applypatch"]);
const SHELL_TOOLS = new Set(["bash", "shell", "local_shell", "exec_command"]);

/** What the agent is doing, as the one line others see; no text means there's nothing to send. */
function describe(event, agent) {
  const name = AGENTS[agent];
  const hookEvent =
    { preToolUse: "PreToolUse", postToolUse: "PostToolUse" }[
      event.hook_event_name
    ] || event.hook_event_name;
  if (DONE_EVENTS.has(hookEvent)) return { state: "done", text: "" };
  if (PROMPT_EVENTS.has(hookEvent))
    return { state: "cooking", text: `${name} is thinking` };
  // Cursor: one event per file its agent changes, with the file at the top level.
  if (hookEvent === "afterFileEdit") {
    const file = fileName(event.file_path);
    return {
      state: "cooking",
      text: file ? `${name} is editing ${file}` : `${name} is editing`,
    };
  }
  if (hookEvent !== "PreToolUse" && hookEvent !== "PostToolUse")
    return { state: "cooking", text: "" };

  const tool = typeof event.tool_name === "string" ? event.tool_name : "";
  const key = tool.toLowerCase();
  let label =
    tool.replace(/^(mcp__|LambdaResponse)/, "").slice(0, 40) || "a tool";
  let detail = "";
  if (EDIT_TOOLS.has(key)) {
    const file = fileName(
      event?.tool_input?.file_path ?? event?.tool_input?.notebook_path,
    );
    if (file) detail = ` ${file}`;
  } else if (PATCH_TOOLS.has(key)) {
    label = "Edit";
    const file = fileName(patchFile(event?.tool_input));
    if (file) detail = ` ${file}`;
  } else if (SHELL_TOOLS.has(key)) {
    if (key !== "bash") label = "Shell";
    const names = programNames(commandText(event?.tool_input));
    if (names.length) detail = ` $ ${names.join(", ")}`;
  }
  return { state: "cooking", text: `${name} is using ${label}${detail}` };
}

async function main() {
  const agent = agentFromArgs(process.argv.slice(2));
  const raw = await readStdin();
  let event = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      event = parsed;
  } catch {}

  // Cursor waits for a reply on stdout before it goes on: give it first, whatever happens next.
  if (agent === "cursor-agent") {
    await new Promise((done) =>
      process.stdout.write(
        event.hook_event_name === "beforeSubmitPrompt"
          ? '{"continue":true}'
          : "{}",
        done,
      ),
    );
  }

  const config = loadConfig();
  if (!config || !raw.trim()) process.exit(0);

  const cwd = eventCwd(event);
  if (!sharedHere(config, agent, cwd)) process.exit(0);

  const { state, text } = describe(event, agent);
  if (state === "cooking" && !text) process.exit(0);

  // Client-side throttle: hook events fire per tool use and can be chatty.
  const now = Date.now();
  if (state === "cooking" && now - lastSentAt(agent) < THROTTLE_MS)
    process.exit(0);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(
      `${config.apiUrl.replace(/\/$/, "")}/api/v1/agent-activity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.credential}`,
        },
        body: JSON.stringify(
          state === "cooking"
            ? {
                text,
                state,
                agent,
                ...gitInfo(cwd, config),
              }
            : { text, state, agent },
        ),
        signal: controller.signal,
      },
    );
    const result = await response.json().catch(() => null);
    if (state === "done") {
      try {
        unlinkSync(statePath(agent));
      } catch {}
    }
    if (state === "cooking" && response.ok && result?.delivered === true) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      try {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(statePath(agent), String(now));
      } catch {}
    }
  } catch {
    // Never let analytics failures disturb the agent session.
  } finally {
    clearTimeout(timer);
  }

  process.exit(0);
}

main();
