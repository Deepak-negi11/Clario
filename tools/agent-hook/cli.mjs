#!/usr/bin/env node
/**
 * viora-agent: show what your Claude Code agent is doing on your Viora avatar.
 *
 *   npx viora-agent setup [--api-url URL] [--global]   agent key + hook, once
 *   npx viora-agent status                              what is set up
 *   npx viora-agent uninstall [--global]                remove the hook
 *
 * setup saves a 180-day agent key in ~/.viora/agent.json (it can only post agent
 * activity), copies the hook to ~/.viora/hook.mjs and registers it in this project's
 * .claude/settings.local.json, or in ~/.claude/settings.json with --global.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const DIR = join(homedir(), ".viora");
const CONFIG_PATH = join(DIR, "agent.json");
const HOOK_PATH = join(DIR, "hook.mjs");
const HOOK_SOURCE = join(dirname(fileURLToPath(import.meta.url)), "viora-agent-hook.mjs");
const DEFAULT_API_URL = "http://localhost:3001";
const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "Stop", "SessionEnd"];
const RENEW_DAYS = 14; // setup makes a new key when the saved one has less time left than this

class CliError extends Error {}
const fail = (message) => {
  throw new CliError(message);
};

/** { value } for a JSON file, {} when it doesn't exist; fails on invalid JSON instead of overwriting it. */
function readJson(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  try {
    return { value: JSON.parse(text) };
  } catch {
    fail(`${file} is not valid JSON. Fix or remove it, then run this again.`);
  }
}

function writeJson(file, value, { mode } = {}) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, mode ? { mode } : {});
  renameSync(tmp, file);
  if (mode) chmodSync(file, mode);
}

/** Days until a JWT expires, or null when it can't be read. */
function daysLeft(token) {
  try {
    const { exp } = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString());
    return typeof exp === "number" ? (exp * 1000 - Date.now()) / 86_400_000 : null;
  } catch {
    return null;
  }
}

async function post(apiUrl, path, body, token) {
  let res;
  try {
    res = await fetch(`${apiUrl}/api/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    fail(`Can't reach the Viora server at ${apiUrl}. Start it, or pass --api-url, then run this again.`);
  }
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Email and password from the terminal (the password isn't echoed), or VIORA_EMAIL / VIORA_PASSWORD. */
async function askCredentials() {
  if (process.env.VIORA_EMAIL && process.env.VIORA_PASSWORD) {
    return { email: process.env.VIORA_EMAIL, password: process.env.VIORA_PASSWORD };
  }
  if (!process.stdin.isTTY) fail("No terminal to ask for your email and password; set VIORA_EMAIL and VIORA_PASSWORD.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ask = (text) => new Promise((resolve) => rl.question(text, resolve));
  const email = (await ask("Viora email: ")).trim();
  const answer = ask("Password: ");
  const write = rl._writeToOutput;
  rl._writeToOutput = () => {}; // hide the password as it's typed
  const password = await answer;
  rl._writeToOutput = write;
  rl.close();
  process.stdout.write("\n");
  return { email, password };
}

/** A usable agent key: the saved one if it has time left, else a new one from the server. */
async function ensureAgentKey(config, apiUrl) {
  const left = daysLeft(config.agentKey);
  if (config.agentKey && config.apiUrl === apiUrl && left !== null && left > RENEW_DAYS) {
    return { key: config.agentKey, days: left, reused: true };
  }
  // A login token from the manual setup (README) is enough to create the key.
  let res = config.token ? await post(apiUrl, "/agent-key", {}, config.token) : null;
  if (!res || res.status !== 200) {
    if (res?.status !== 404) {
      const { email, password } = await askCredentials();
      const signin = await post(apiUrl, "/signin", { email, password });
      if (!signin.json?.token) fail("Sign-in failed. Check your email and password.");
      res = await post(apiUrl, "/agent-key", {}, signin.json.token);
    }
  }
  if (res.status === 404) fail(`The server at ${apiUrl} has no /api/v1/agent-key yet. Restart it so it runs the latest code.`);
  if (res.status !== 200 || !res.json?.key) fail(`Could not create an agent key (HTTP ${res.status}).`);
  return { key: res.json.key, days: daysLeft(res.json.key), reused: false };
}

// ---- Claude Code settings -------------------------------------------------------

const settingsFile = (global) =>
  global ? join(homedir(), ".claude", "settings.json") : join(process.cwd(), ".claude", "settings.local.json");

/** Viora hooks from any version: this package's copy, or the repo script. */
const isVioraHook = (hook) => typeof hook?.command === "string" && /viora-agent-hook\.mjs|[\\/]\.viora[\\/]hook\.mjs/.test(hook.command);

/** Settings with every Viora hook removed; other hooks and settings are left exactly as they were. */
function withoutViora(settings) {
  if (!settings.hooks || typeof settings.hooks !== "object") return settings;
  const hooks = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) {
      hooks[event] = groups;
      continue;
    }
    const kept = groups
      .map((group) => (Array.isArray(group?.hooks) ? { ...group, hooks: group.hooks.filter((h) => !isVioraHook(h)) } : group))
      .filter((group) => !Array.isArray(group?.hooks) || group.hooks.length > 0);
    if (kept.length) hooks[event] = kept;
  }
  const { hooks: _old, ...rest } = settings;
  return Object.keys(hooks).length ? { ...rest, hooks } : rest;
}

const countViora = (settings) =>
  Object.values(settings?.hooks ?? {}).flat().flatMap((group) => group?.hooks ?? []).filter(isVioraHook).length;

/** Add the hook for every event, replacing older Viora entries so it never fires twice. */
function registerHooks(file) {
  const { value = {} } = readJson(file);
  if (existsSync(file)) copyFileSync(file, `${file}.viora-backup`);
  const settings = withoutViora(value);
  const hooks = { ...(settings.hooks ?? {}) };
  const command = `node "${HOOK_PATH}"`;
  for (const event of HOOK_EVENTS) hooks[event] = [...(hooks[event] ?? []), { hooks: [{ type: "command", command, timeout: 10 }] }];
  writeJson(file, { ...settings, hooks });
}

function gitIgnored(file) {
  try {
    execFileSync("git", ["check-ignore", "-q", file], { cwd: dirname(file), stdio: "ignore" });
    return true;
  } catch (e) {
    return e.status === 1 ? false : null; // 1: tracked-able; anything else: not a git repo
  }
}

// ---- Commands -----------------------------------------------------------------------

async function setup(opts) {
  const { value: config = {} } = readJson(CONFIG_PATH);
  const apiUrl = String(opts.apiUrl || config.apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  const { key, days, reused } = await ensureAgentKey(config, apiUrl);

  // The 7-day login token isn't needed any more; everything else (shareGit…) stays.
  const { token: _loginToken, ...rest } = config;
  writeJson(CONFIG_PATH, { ...rest, apiUrl, agentKey: key }, { mode: 0o600 });
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  copyFileSync(HOOK_SOURCE, HOOK_PATH);

  const file = settingsFile(opts.global);
  registerHooks(file);

  const until = new Date(Date.now() + days * 86_400_000).toDateString();
  console.log(`${reused ? "Kept your agent key" : "Saved a new agent key"} in ${CONFIG_PATH} (works until ${until}).`);
  console.log(`Hook registered in ${file}${opts.global ? " for every project" : " for this project only"}.`);
  if (!opts.global && gitIgnored(file) === false) {
    console.log("Note: .claude/settings.local.json isn't git-ignored here. It holds no secrets, but you may want to ignore it.");
  }
  console.log("Open your Viora space and give Claude a task: your avatar's card shows what it's doing.");
}

function status() {
  const { value: config = {} } = readJson(CONFIG_PATH);
  const left = daysLeft(config.agentKey ?? config.token);
  console.log(`Server:  ${config.apiUrl ?? "not set"}`);
  console.log(
    config.agentKey || config.token
      ? `Key:     ${config.agentKey ? "agent key" : "7-day login token"}, ${left === null ? "unreadable" : left > 0 ? `${Math.floor(left)} days left` : "EXPIRED (run setup)"}`
      : "Key:     none (run setup)",
  );
  console.log(`Hook:    ${existsSync(HOOK_PATH) ? HOOK_PATH : "not installed (run setup)"}`);
  for (const global of [false, true]) {
    const file = settingsFile(global);
    const n = countViora(readJson(file).value);
    console.log(`${global ? "All projects" : "This project"}: ${n ? `registered (${file})` : "not registered"}`);
  }
}

function uninstall(opts) {
  const file = settingsFile(opts.global);
  const { value } = readJson(file);
  if (!value || !countViora(value)) {
    console.log(`No Viora hook in ${file}.`);
    return;
  }
  copyFileSync(file, `${file}.viora-backup`);
  writeJson(file, withoutViora(value));
  console.log(`Removed the Viora hook from ${file}. Your key stays in ${CONFIG_PATH}; delete that file to remove it too.`);
}

const HELP = `viora-agent: show what your Claude Code agent is doing on your Viora avatar

  viora-agent setup [--api-url URL] [--global]   save an agent key and register the hook
  viora-agent status                              show what is set up
  viora-agent uninstall [--global]                remove the hook

Without --global the hook is registered only for the project you run it in.
--api-url defaults to the saved server, then ${DEFAULT_API_URL}.`;

export async function run(argv) {
  const [command = "help", ...rest] = argv;
  const i = rest.indexOf("--api-url");
  const opts = { global: rest.includes("--global"), apiUrl: i > -1 ? rest[i + 1] : undefined };
  try {
    if (command === "setup") await setup(opts);
    else if (command === "status") status();
    else if (command === "uninstall") uninstall(opts);
    else console.log(HELP);
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    console.error(e.message);
    process.exitCode = 1;
  }
}

// Run when called as a command (npm links the bin, so compare real paths).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  run(process.argv.slice(2));
}
