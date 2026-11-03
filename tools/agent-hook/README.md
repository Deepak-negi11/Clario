# clario-agent: show your AI agent's activity in Clario 🧑‍🍳

A hook for **Claude Code, Codex and Cursor** that shows what your coding agent is working on
to everyone in your current Clario space. Others see a pulsing badge above your avatar while
the agent works, and clicking your avatar shows your agent card: which agent, what it's doing,
and the project, branch and commit (e.g. `graphite · feat/missions · a1b2c3d`). The badge
clears when the agent finishes.

## Setup (one command)

1. Open your space on [clario.games](https://www.clario.games) and click **Agent** in the
   left menu. It shows your setup command, with your key in it:
   ```bash
   npx clario-agent@latest setup --key YOUR_KEY
   ```
2. Copy it and run it in the terminal, inside the project you want to share. It sets up
   every agent it finds on your computer (Claude Code, Codex, Cursor). To pick them
   yourself, add `--agent codex`, `--agent claude,cursor` or `--agent all`.

That's it: the Agent button disappears once your agent has connected. Setup:

- **Checks the key** with the Clario server and saves it in `~/.clario/agent.json` (readable
  only by you). It's your own key and it stays the same: the Agent button always shows the
  same command for you. It can only post agent activity: it can't sign in, open a space or
  change anything else. No password is ever typed in the terminal.
- **Installs the hook** at `~/.clario/hook.mjs`.
- **Registers it with your agent:**

  | Agent | Hook file | Shared from |
  |---|---|---|
  | Claude Code | `.claude/settings.local.json` in this project (`~/.claude/settings.json` with `--global`) | this project |
  | Codex | `~/.codex/hooks.json` (or `$CODEX_HOME/hooks.json`) | the projects you ran setup in |
  | Cursor | `~/.cursor/hooks.json` | the projects you ran setup in |

  Codex and Cursor read one hook file for every project, so the hook itself only reports
  from the projects you ran setup in; add `--global` to share from all of them.
- **Codex** asks before it runs a new hook: open Codex, run `/hooks` and trust the Clario
  hook. **Cursor**: restart it if it was open.

Then give your agent a task in that project and click your avatar. Teammates who do the same
and join your space show up on their avatars too.

To add another project or a newly installed agent later, run `npx clario-agent@latest setup` there: it reuses your
saved key. Setup never registers the hook twice, leaves your other settings and hooks as they
are, and saves the previous file next to it as `*.clario-backup`.

```bash
npx clario-agent status              # server, key, which agents are set up and where
npx clario-agent uninstall           # stop sharing from this project, for every agent
npx clario-agent uninstall --global  # remove every Clario hook and stop sharing everywhere
```

It uses the live server at `https://api.clario.games`. Running Clario yourself? The Agent
button on your own site adds `--api-url` to the command for you.

Used the older `viora-agent` package? Run `npx clario-agent setup` once: it reuses the key
from `~/.viora` and replaces the old hook. You can delete `~/.viora` afterwards.

> Keep the setup command private: anyone with your key can post activity as your agent (and
> nothing else). If it leaks, delete `~/.clario/agent.json`; the server's owner can cancel
> every key by changing `JWT_SECRET` (this signs everyone out).

## How it behaves

- While your agent works your badge shows "cooking" with a short description of what it's
  doing, e.g. `Claude is using Edit page.tsx`, `Codex is using Shell $ bun, git` or
  `Cursor is editing page.tsx`, and the card says which agent it is
- Your agent card also shows the project folder, git branch and short commit the agent is
  working in
- When the agent finishes, the badge clears automatically
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
