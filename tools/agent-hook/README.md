# clario-agent: show your AI agent's activity in Clario 🧑‍🍳

A Claude Code hook that shows what your agent is working on to everyone in your current
Clario space. Others see a pulsing badge above your avatar while the agent works, and
clicking your avatar shows your agent card: what Claude is doing plus the project, branch
and commit (e.g. `graphite · feat/missions · a1b2c3d`). The badge clears when Claude finishes.

## Setup (one command)

1. Open your space on [clario.games](https://www.clario.games) and click **Agent** in the
   left menu. It shows your setup command, with a key made for you:
   ```bash
   npx clario-agent setup --key YOUR_KEY
   ```
2. Copy it and run it in the terminal, inside the project you want to share.

That's it: the Agent button disappears once your agent has connected. Setup:

- **Checks the key** with the Clario server and saves it in `~/.clario/agent.json` (readable
  only by you). It's your own key and it stays the same: the Agent button always shows the
  same command for you. It can only post agent activity: it can't sign in, open a space or
  change anything else. No password is ever typed in the terminal.
- **Installs the hook** at `~/.clario/hook.mjs`.
- **Registers it with Claude Code** for this project only, in `.claude/settings.local.json`.
  Add `--global` to use it in every project (`~/.claude/settings.json`) instead.

Then give Claude a task in that project and click your avatar. Teammates who do the same and
join your space show up on their avatars too.

To add another project later, run `npx clario-agent setup` there: it reuses your saved key.
Setup never registers the hook twice, leaves your other Claude Code settings and hooks as
they are, and saves the previous file next to it as `*.clario-backup`.

```bash
npx clario-agent status      # server, key expiry, where the hook is registered
npx clario-agent uninstall   # remove the hook from this project (add --global for all)
```

It uses the live server at `https://api.clario.games`. Running Clario yourself? The Agent
button on your own site adds `--api-url` to the command for you.

Used the older `viora-agent` package? Run `npx clario-agent setup` once: it reuses the key
from `~/.viora` and replaces the old hook. You can delete `~/.viora` afterwards.

> Keep the setup command private: anyone with your key can post activity as your agent (and
> nothing else). If it leaks, delete `~/.clario/agent.json`; the server's owner can cancel
> every key by changing `JWT_SECRET` (this signs everyone out).

## How it behaves

- While Claude runs tools (edits, bash commands…) your badge shows "cooking" with a short
  description of the current tool (e.g. `Claude is using Edit page.tsx` or
  `Claude is using Bash $ bun, git`)
- Your agent card also shows the project folder, git branch and short commit the agent is
  working in
- When Claude finishes, the badge clears automatically
- If you're not inside a Clario space, updates are silently dropped
- Updates are throttled (2s) so fast tool bursts don't spam the room
- The hook never blocks or fails your agent session: all errors are swallowed

## Privacy notes

Everyone in your space sees what is sent. That is the tool name, the edited file's name,
the names of the programs a shell command runs (`bun`, `git`; never its arguments, which
can hold tokens or paths), and the project folder, branch and short commit. Never file
contents, prompts or code.

To keep project, branch and commit on your machine, add `"shareGit": false` to
`~/.clario/agent.json` (or set `CLARIO_SHARE_GIT=0`). Run `npx clario-agent uninstall` to stop
broadcasting from a project.

Requires Node.js 18 or newer. MIT licensed.
