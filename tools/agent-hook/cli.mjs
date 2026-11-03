#!/usr/bin/env node
/**
 * clario-agent: show what your Claude Code agent is doing on your Clario avatar.
 *
 *   npx clario-agent setup --key KEY [--api-url URL] [--global]   key + hook, once
 *   npx clario-agent status                                        what is set up
 *   npx clario-agent uninstall [--global]                          remove the hook
 *
 * The key comes from the website: the Agent button in a Clario space shows the whole
 * setup command. setup checks the key with the server, saves it in ~/.clario/agent.json
 * (one key per user that stays the same; it can only post agent activity), copies the hook to
 * ~/.clario/hook.mjs and registers it in this project's .claude/settings.local.json,
 * or in ~/.claude/settings.json with --global.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(homedir(), ".clario");
const CONFIG_PATH = join(DIR, "agent.json");
const HOOK_PATH = join(DIR, "hook.mjs");
const HOOK_SOURCE = join(dirname(fileURLToPath(import.meta.url)), "clario-agent-hook.mjs");
// Where this package kept its key before it was renamed: setup reuses that key instead of asking again.
const OLD_CONFIG_PATH = join(homedir(), ".viora", "agent.json");
// The live Clario server; pass --api-url http://localhost:3001 for a local one.
const DEFAULT_API_URL = "https://api.clario.games";
const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "Stop", "SessionEnd"];
const WARN_DAYS = 14; // setup reminds you to get a new key when the saved one has less time left than this
const GET_A_KEY = "Open your Clario space at https://www.clario.games, click Agent in the left menu, and run the setup command it shows.";

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

/** The readable part of a key (a JWT), or null. The server checks the signature. */
function keyPayload(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString());
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/** Days until a key expires: Infinity for one that doesn't (today's keys), null when it can't be read. */
function daysLeft(token) {
  const payload = keyPayload(token);
  if (!payload) return null;
  return typeof payload.exp === "number" ? (payload.exp * 1000 - Date.now()) / 86_400_000 : Infinity;
}

const expiryText = (days) =>
  Number.isFinite(days) ? `works until ${new Date(Date.now() + days * 86_400_000).toDateString()}` : "it doesn't expire";

async function post(apiUrl, path, body, token) {
  let res;
  try {
    res = await fetch(`${apiUrl}/api/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    fail(`Can't reach the Clario server at ${apiUrl}. Start it, or pass --api-url, then run this again.`);
  }
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** A key from the website, checked with the server before it's saved. */
async function checkKey(key, apiUrl) {
  const payload = keyPayload(key);
  if (!payload || typeof payload.userId !== "string") fail(`That isn't a Clario agent key. ${GET_A_KEY}`);
  if (payload.scope !== "agent") fail(`That's a login token, not an agent key. ${GET_A_KEY}`);
  const days = daysLeft(key);
  if (days === null || days <= 0) fail(`That key has expired. ${GET_A_KEY}`);
  // A "done" update changes nothing anyone sees, and tells the server the hook is set up.
  const res = await post(apiUrl, "/agent-activity", { text: "", state: "done" }, key);
  if (res.status === 403) fail(`The server at ${apiUrl} doesn't accept this key. ${GET_A_KEY}`);
  if (res.status !== 200) fail(`Could not check the key with ${apiUrl} (HTTP ${res.status}).`);
  return { key, days, reused: false };
}

/** The key from an earlier setup, when it still works for this server (e.g. to add another project). */
function savedKey(config, apiUrl) {
  const days = daysLeft(config.agentKey);
  if (config.agentKey && config.apiUrl === apiUrl && days !== null && days > 0) return { key: config.agentKey, days, reused: true };
  fail(`No agent key yet. ${GET_A_KEY}`);
}

// ---- Claude Code settings -------------------------------------------------------

const settingsFile = (global) =>
  global ? join(homedir(), ".claude", "settings.json") : join(process.cwd(), ".claude", "settings.local.json");

/** Our hooks from any version (also from before the rename): this package's copy, or the repo script. */
const isOurHook = (hook) =>
  typeof hook?.command === "string" && /(clario|viora)-agent-hook\.mjs|[\\/]\.(clario|viora)[\\/]hook\.mjs/.test(hook.command);

/** Settings with every one of our hooks removed; other hooks and settings are left exactly as they were. */
function withoutOurHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== "object") return settings;
  const hooks = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) {
      hooks[event] = groups;
      continue;
    }
    const kept = groups
      .map((group) => (Array.isArray(group?.hooks) ? { ...group, hooks: group.hooks.filter((h) => !isOurHook(h)) } : group))
      .filter((group) => !Array.isArray(group?.hooks) || group.hooks.length > 0);
    if (kept.length) hooks[event] = kept;
  }
  const { hooks: _old, ...rest } = settings;
  return Object.keys(hooks).length ? { ...rest, hooks } : rest;
}

const countOurHooks = (settings) =>
  Object.values(settings?.hooks ?? {}).flat().flatMap((group) => group?.hooks ?? []).filter(isOurHook).length;

/** Add the hook for every event, replacing older entries of ours so it never fires twice. */
function registerHooks(file) {
  const { value = {} } = readJson(file);
  if (existsSync(file)) copyFileSync(file, `${file}.clario-backup`);
  const settings = withoutOurHooks(value);
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
  const { value: config = readJson(OLD_CONFIG_PATH).value ?? {} } = readJson(CONFIG_PATH);
  // A new key comes from the live site unless --api-url says otherwise; re-running setup keeps the saved server.
  const apiUrl = String(opts.apiUrl || (opts.key ? DEFAULT_API_URL : config.apiUrl) || DEFAULT_API_URL).replace(/\/+$/, "");
  const { key, days, reused } = opts.key ? await checkKey(opts.key, apiUrl) : savedKey(config, apiUrl);

  // An old 7-day login token isn't needed any more; everything else (shareGit…) stays.
  const { token: _loginToken, ...rest } = config;
  writeJson(CONFIG_PATH, { ...rest, apiUrl, agentKey: key }, { mode: 0o600 });
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  copyFileSync(HOOK_SOURCE, HOOK_PATH);

  const file = settingsFile(opts.global);
  registerHooks(file);

  console.log(`${reused ? "Kept your agent key" : "Saved your agent key"} in ${CONFIG_PATH} (${expiryText(days)}).`);
  if (reused && days < WARN_DAYS) console.log(`It runs out in ${Math.ceil(days)} days. ${GET_A_KEY}`);
  console.log(`Hook registered in ${file}${opts.global ? " for every project" : " for this project only"}.`);
  if (!opts.global && gitIgnored(file) === false) {
    console.log("Note: .claude/settings.local.json isn't git-ignored here. It holds no secrets, but you may want to ignore it.");
  }
  console.log("Open your Clario space and give Claude a task: your avatar's card shows what it's doing.");
}

function status() {
  const { value: config = {} } = readJson(CONFIG_PATH);
  const left = daysLeft(config.agentKey ?? config.token);
  console.log(`Server:  ${config.apiUrl ?? "not set"}`);
  console.log(
    config.agentKey || config.token
      ? `Key:     ${config.agentKey ? "agent key" : "7-day login token"}, ${left === null ? "unreadable" : left === Infinity ? "doesn't expire" : left > 0 ? `${Math.floor(left)} days left` : "EXPIRED (run setup)"}`
      : "Key:     none (run setup)",
  );
  console.log(`Hook:    ${existsSync(HOOK_PATH) ? HOOK_PATH : "not installed (run setup)"}`);
  for (const global of [false, true]) {
    const file = settingsFile(global);
    const n = countOurHooks(readJson(file).value);
    console.log(`${global ? "All projects" : "This project"}: ${n ? `registered (${file})` : "not registered"}`);
  }
}

function uninstall(opts) {
  const file = settingsFile(opts.global);
  const { value } = readJson(file);
  if (!value || !countOurHooks(value)) {
    console.log(`No Clario hook in ${file}.`);
    return;
  }
  copyFileSync(file, `${file}.clario-backup`);
  writeJson(file, withoutOurHooks(value));
  console.log(`Removed the Clario hook from ${file}. Your key stays in ${CONFIG_PATH}; delete that file to remove it too.`);
}

const HELP = `clario-agent: show what your Claude Code agent is doing on your Clario avatar

  clario-agent setup --key KEY [--api-url URL] [--global]   save your key and register the hook
  clario-agent status                                        show what is set up
  clario-agent uninstall [--global]                          remove the hook

Get the setup command (with your key) from the Agent button in your Clario space.
Without --global the hook is registered only for the project you run it in.
Without --key, setup reuses the key you saved before. The server is ${DEFAULT_API_URL}
unless you pass --api-url.`;

export async function run(argv) {
  const [command = "help", ...rest] = argv;
  const value = (flag) => {
    const i = rest.indexOf(flag);
    return i > -1 ? rest[i + 1] : undefined;
  };
  const opts = { global: rest.includes("--global"), apiUrl: value("--api-url"), key: value("--key") };
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
