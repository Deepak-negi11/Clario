# viora-agent: show your AI agent's activity in Viora 🧑‍🍳

A Claude Code hook that shows what your agent is working on to everyone in your current
Viora space. Others see a pulsing badge above your avatar while the agent works, and
clicking your avatar shows your agent card: what Claude is doing plus the project, branch
and commit (e.g. `graphite · feat/missions · a1b2c3d`). The badge clears when Claude finishes.

## Setup (one command)

With your Viora server running, run this inside the project you want to share:

```bash
npx viora-agent setup --api-url http://localhost:3001
```

It does three things:

1. **Saves an agent key** in `~/.viora/agent.json` (readable only by you). It asks for your
   Viora email and password once (sent only to that server). The key lasts 180 days and
   can only post agent activity: it can't sign in, open a space or change anything else.
2. **Installs the hook** at `~/.viora/hook.mjs`.
3. **Registers it with Claude Code** for this project only, in `.claude/settings.local.json`.
   Add `--global` to use it in every project (`~/.claude/settings.json`) instead.

Then open your Viora space, give Claude a task in that project, and click your avatar.

Running `setup` again keeps a key that still has more than 14 days left, updates the hook
and never registers it twice. Your other Claude Code settings and hooks are left as they
are, and the previous file is saved next to it as `*.viora-backup`.

```bash
npx viora-agent status      # server, key expiry, where the hook is registered
npx viora-agent uninstall   # remove the hook from this project (add --global for all)
```

From a checkout of this repo, `node tools/agent-hook/setup.mjs` does the same as `setup`.
For scripts, `VIORA_EMAIL` and `VIORA_PASSWORD` are read instead of prompting.

<details>
<summary>Manual alternative: a 7-day login token</summary>

Sign in, open DevTools → Console on your Viora site and run
`copy(localStorage.getItem("metaverse:token"))`, then save it as `"token"` in
`~/.viora/agent.json` next to `"apiUrl"`. It expires after 7 days. If you then run
`setup`, it uses that token to create the agent key without asking for your password.
</details>

> An agent key can't be cancelled on its own before it expires. If one leaks, delete it
> from `~/.viora/agent.json` and change the server's `JWT_SECRET` (this signs everyone out).
> The server needs the `/api/v1/agent-key` endpoint from this repo's `apps/server`.

## How it behaves

- While Claude runs tools (edits, bash commands…) your badge shows "cooking" with a short
  description of the current tool (e.g. `Claude is using Edit page.tsx` or
  `Claude is using Bash $ bun, git`)
- Your agent card also shows the project folder, git branch and short commit the agent is
  working in
- When Claude finishes, the badge clears automatically
- If you're not inside a Viora space, updates are silently dropped
- Updates are throttled (2s) so fast tool bursts don't spam the room
- The hook never blocks or fails your agent session: all errors are swallowed

## Privacy notes

Everyone in your space sees what is sent. That is the tool name, the edited file's name,
the names of the programs a shell command runs (`bun`, `git`; never its arguments, which
can hold tokens or paths), and the project folder, branch and short commit. Never file
contents, prompts or code.

To keep project, branch and commit on your machine, add `"shareGit": false` to
`~/.viora/agent.json` (or set `VIORA_SHARE_GIT=0`). Run `npx viora-agent uninstall` to stop
broadcasting from a project.

Requires Node.js 18 or newer. MIT licensed.
