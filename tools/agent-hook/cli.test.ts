import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCli } from "./cli.mjs";

let root: string;
let log: ReturnType<typeof spyOn>;
const servers: ReturnType<typeof Bun.serve>[] = [];
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "clario-users-"));
  log = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  log.mockRestore();
  servers.splice(0).forEach((server) => server.stop(true));
  rmSync(root, { recursive: true, force: true });
  process.exitCode = 0;
});
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
function user(name: string) {
  const homeDir = join(root, name),
    workingDir = join(root, `${name} project`);
  mkdirSync(workingDir, { recursive: true });
  for (const dir of [".claude", ".codex", ".cursor"])
    mkdirSync(join(homeDir, dir), { recursive: true });
  return {
    homeDir,
    workingDir,
    config: join(homeDir, ".clario", "agent.json"),
    env: {},
  };
}
const key = (userId: string) =>
  `e30.${Buffer.from(JSON.stringify({ userId, scope: "agent" })).toString("base64url")}.test`;
function api() {
  const calls: { token: string; body: Record<string, unknown> }[] = [];
  let fail = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const body = (await req.json()) as Record<string, unknown>;
      calls.push({ token: req.headers.get("authorization") ?? "", body });
      return Response.json({ delivered: !fail }, { status: fail ? 503 : 200 });
    },
  });
  servers.push(server);
  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}
async function hook(
  u: ReturnType<typeof user>,
  agent: string,
  event: Record<string, unknown>,
  cwd = u.workingDir,
) {
  const child = Bun.spawn(
    ["node", join(u.homeDir, ".clario", "hook.mjs"), "--agent", agent],
    {
      cwd,
      env: { ...process.env, CLARIO_HOME: join(u.homeDir, ".clario") },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  child.stdin.write(JSON.stringify({ cwd, ...event }));
  child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  return stdout;
}
const ember = { command: 'node "/other app/ember-hook.mjs" --agent codex' };

test("fresh users get all installed agents, retain Ember, and repeated setup does not duplicate hooks", async () => {
  const u = user("Alice Smith"),
    backend = api(),
    cli = createCli(u);
  writeFileSync(
    join(u.homeDir, ".codex", "hooks.json"),
    JSON.stringify({
      custom: true,
      hooks: { PostToolUse: [{ hooks: [{ type: "command", ...ember }] }] },
    }),
  );
  writeFileSync(
    join(u.homeDir, ".cursor", "hooks.json"),
    JSON.stringify({ version: 1, hooks: { stop: [ember] } }),
  );
  await cli.run(["setup", "--key", key("alice"), "--api-url", backend.url]);
  const codex = json(join(u.homeDir, ".codex", "hooks.json")),
    cursor = json(join(u.homeDir, ".cursor", "hooks.json"));
  expect(codex.hooks.PostToolUse[0].hooks[0]).toEqual({
    type: "command",
    ...ember,
  });
  expect(codex.hooks.PostToolUse).toHaveLength(2);
  expect(codex.hooks.SessionEnd[0].hooks[0].timeout).toBe(3);
  expect(cursor.hooks.stop[0]).toEqual(ember);
  for (const event of [
    "beforeSubmitPrompt",
    "preToolUse",
    "postToolUse",
    "afterFileEdit",
    "stop",
    "sessionEnd",
  ])
    expect(cursor.hooks[event]).toBeArray();
  await cli.run(["setup"]);
  expect(json(join(u.homeDir, ".codex", "hooks.json"))).toEqual(codex);
  expect(json(join(u.homeDir, ".cursor", "hooks.json"))).toEqual(cursor);
  await cli.run(["uninstall", "--global"]);
  expect(json(join(u.homeDir, ".codex", "hooks.json"))).toEqual({
    custom: true,
    hooks: { PostToolUse: [{ hooks: [{ type: "command", ...ember }] }] },
  });
  expect(json(join(u.homeDir, ".cursor", "hooks.json"))).toEqual({
    version: 1,
    hooks: { stop: [ember] },
  });
});

test("two users send their own keys; one agent does not throttle a different agent", async () => {
  const a = user("Alice"),
    b = user("Bob"),
    backend = api();
  for (const [u, id] of [
    [a, "alice"],
    [b, "bob"],
  ] as const)
    await createCli(u).run([
      "setup",
      "--key",
      key(id),
      "--api-url",
      backend.url,
    ]);
  backend.calls.length = 0;
  await hook(a, "claude-code", {
    hook_event_name: "PreToolUse",
    tool_name: "Read",
  });
  await hook(a, "codex", {
    hook_event_name: "UserPromptSubmit",
    prompt: "NEVER_SHARE_THIS",
  });
  await hook(b, "cursor-agent", {
    hook_event_name: "beforeSubmitPrompt",
    prompt: "NEVER_SHARE_THIS",
  });
  expect(backend.calls.map((c) => c.token)).toEqual([
    `Bearer ${key("alice")}`,
    `Bearer ${key("alice")}`,
    `Bearer ${key("bob")}`,
  ]);
  expect(backend.calls.map((c) => c.body.agent)).toEqual([
    "claude-code",
    "codex",
    "cursor-agent",
  ]);
  expect(JSON.stringify(backend.calls)).not.toContain("NEVER_SHARE_THIS");
});

test("Cursor shell/file/session events have neutral replies, private summaries, and immediate restart after stop", async () => {
  const u = user("Cursor User"),
    backend = api();
  await createCli(u).run([
    "setup",
    "--key",
    key("cursor"),
    "--api-url",
    backend.url,
  ]);
  backend.calls.length = 0;
  expect(
    JSON.parse(
      await hook(u, "cursor-agent", { hook_event_name: "beforeSubmitPrompt" }),
    ),
  ).toEqual({ continue: true });
  expect(
    JSON.parse(await hook(u, "cursor-agent", { hook_event_name: "stop" })),
  ).toEqual({});
  await hook(u, "cursor-agent", {
    hook_event_name: "preToolUse",
    tool_name: "Shell",
    tool_input: { command: "npm test --token NEVER_SHARE_THIS" },
  });
  expect(backend.calls.at(-1)?.body).toMatchObject({
    agent: "cursor-agent",
    state: "cooking",
    text: "Cursor is using Shell $ npm",
  });
  await hook(u, "cursor-agent", { hook_event_name: "sessionEnd" });
  await hook(u, "cursor-agent", {
    hook_event_name: "afterFileEdit",
    file_path: "/private/hidden/example.ts",
  });
  expect(backend.calls.at(-1)?.body.text).toBe("Cursor is editing example.ts");
  expect(JSON.stringify(backend.calls)).not.toContain("NEVER_SHARE_THIS");
  expect(JSON.stringify(backend.calls)).not.toContain("/private/hidden");
});

test("failed delivery is retried immediately and unshared projects send nothing", async () => {
  const u = user("Retry"),
    backend = api();
  await createCli(u).run([
    "setup",
    "--key",
    key("retry"),
    "--api-url",
    backend.url,
  ]);
  backend.calls.length = 0;
  backend.fail(true);
  await hook(u, "codex", { hook_event_name: "UserPromptSubmit" });
  backend.fail(false);
  await hook(u, "codex", { hook_event_name: "UserPromptSubmit" });
  expect(backend.calls).toHaveLength(2);
  const unshared = join(root, "unshared");
  mkdirSync(unshared);
  await hook(u, "codex", { hook_event_name: "UserPromptSubmit" }, unshared);
  expect(backend.calls).toHaveLength(2);
});
