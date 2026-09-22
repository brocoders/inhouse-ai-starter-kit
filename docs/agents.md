# Setting up your own machine

Everything in this repository is shared: the rules, the skills, the hooks, the
permissions. This page covers the handful of settings that live on **your**
computer instead, because they are about how much you want to be asked.

## Stop being asked about every command

By default Claude Code asks before each command it runs. Once you trust the
fences below, turn that off and let it work.

Open `~/.claude/settings.json` — your own file, not the one in this project —
and add:

```json
{
  "permissions": { "defaultMode": "acceptEdits" }
}
```

Use `"bypassPermissions"` instead if you want it to stop asking about commands
as well. Read the next section before you do.

`defaultMode` only works in your personal settings. Setting it in the project's
`.claude/settings.json` does nothing at all — Claude Code ignores it there on
purpose, so that cloning a repository can never quietly widen what an agent may
do on your machine. That is why this page exists.

The project's own `.claude/settings.json` still applies, and it is the part you
share with everyone: the everyday commands are allowed, anything that leaves
this computer (`git push`, `gh pr`, `pnpm release`, `ssh`) asks first, and
reading `.env` or `data/` is denied outright.

## What the sandbox actually does

The project turns Claude Code's sandbox on. Inside it, a command can read and
write this project and not much else: `~/.ssh`, `~/.aws` and
`~/.config/inhouse` are unreadable, and the network is limited to GitHub, the
npm registry, Anthropic's API and Resend. Anything the sandbox has already
contained does not need to ask you, which is what makes auto mode comfortable.

`docker` and `ssh` are excluded, because they are how the app reaches the
server and a sandbox cannot supervise what happens on the other end. Those
still ask.

- **macOS** — works as described, built in.
- **Linux** — works as described.
- **Windows** — there is no sandbox on native Windows. Work inside **WSL2**:
  install it, clone the project inside the Linux filesystem (not under
  `/mnt/c`, which is slow), and run Claude Code there. Without WSL2 you have
  the hooks and the permissions but not the sandbox, so leave auto mode off.

The hooks are the second fence and they work everywhere, WSL2 or not. They
refuse `rm -rf` on anything that is not rebuilt by a command, `sudo`, a force
push, `docker compose down -v`, a database command pointed at your server, and
a download piped into a shell. They also refuse edits to registry components,
to a migration that has already run, and to `.env`.

## The two profiles

`inhouse.config.json` holds one of them, and it decides how much the agent
finishes on its own:

- **`solo`** — the agent reviews, merges, releases and tidies up after itself.
  No second pair of eyes. This is the right setting when the app is yours.
- **`team`** — the agent stops at a pull request and someone merges it. Use it
  when more than one person is building, or when a mistake would reach people
  who did not ask for it.

You can change it whenever you like; it is one word in one file.

## Which model

- **Opus** for the session you talk to: planning, reviewing, deciding, and
  anything that is stuck.
- **Sonnet** for routine work that a test already fences in — a screen like
  the last one, an endpoint with a spec.
- **Fable** when the task is genuinely hard: a root cause nobody has found, an
  architecture question, a bug that has come back twice. Do not ration it; a
  second hour on the wrong model costs more than the switch.

Two things worth knowing. Raise the **effort** before you change the model —
it is the cheaper lever and it is often enough. And a session cannot change
its own model: when the agent says it needs a stronger one, that is a request
for you to switch, not a complaint.

## If you use Codex instead

Everything important is shared. Codex reads `AGENTS.md`, the same file Claude
Code reads, and finds the same procedures in `.agents/skills/`, which is a
symlink to `.claude/skills/`. Writing a skill once serves both.

What Codex does not get is the Claude-only half: the hooks, the sandbox
settings and the subagent definitions under `.claude/`. So the fences are
thinner there — the checks still run in CI, and `pnpm check` still gates a
release, but nothing stops a bad command before it runs. Be correspondingly
less eager about automatic approval.
