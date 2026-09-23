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
share with everyone: the everyday commands are allowed (`pnpm`, and `node` for
`scripts/`, `server/src/`, `--test` and `--run`), anything that leaves this
computer (`git push`, `gh pr`, `pnpm release` in any spelling, `ssh`) asks
first, and reading `.env` or `data/` is denied outright. A bare `node *` is
deliberately not allowed: `pnpm release` is `node deploy/release.mjs`, and an
allow for every `node` command would let the release skip its question.

## What the sandbox actually does

The project turns Claude Code's sandbox on. Inside it, a command can read and
write this project and not much else: `~/.ssh`, `~/.aws` and
`~/.config/inhouse` are unreadable, and the network is limited to the hosts
below. Anything the sandbox has already contained does not need to ask you,
which is what makes auto mode comfortable.

| Host                                     | Why a command needs it                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `github.com`                             | `git fetch` and `git push`                                                  |
| `api.github.com`                         | `gh` — pull requests, CI status, releases                                   |
| `*.githubusercontent.com`                | raw files and release downloads from GitHub, used by `gh` and some packages |
| `registry.npmjs.org`, `*.npmjs.org`      | `pnpm install` and `pnpm add`                                               |
| `nodejs.org`                             | downloading Node itself (`pnpm env use`, corepack)                          |
| `api.anthropic.com`                      | the app's own language-model calls, in tests and scripts                    |
| `resend.com`, `api.resend.com`           | sending a real e-mail from a script; the API lives on `api.`                |
| `ui.shadcn.com`                          | `pnpm exec shadcn add`, which fetches components from the registry          |
| `cdn.playwright.dev`                     | `pnpm exec playwright install chromium`, the browser `pnpm shots` drives    |
| `playwright.download.prss.microsoft.com` | the mirror Playwright falls back to for the same download                   |

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
a download piped into a shell — including when the command is hidden inside
`sh -c`, `xargs`, `$(…)` or `node -e`. They also refuse edits to registry
components, to a migration that has already run, and to `.env`.

## What is enforced, and by what

A rule in `AGENTS.md` is a request unless something below stops the action.
The agent should treat the enforced ones as fences it will hit, and the rest
as its own responsibility.

| Rule                                               | Enforced by                                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never edit `components/ui/`                        | write hook (`protect-files.mjs`, refuses); permission rule `Edit(/frontend/src/components/ui/**)` (asks, so `sed` in a shell asks too)                          |
| Never modify an applied migration                  | write hook (refuses an existing file); permission rule (asks); `check-repo.mjs` (fails when a migration on `main` differs)                                      |
| Never write `.env`                                 | write hook; permission rule `Edit(.env)` / `Edit(.env.*)` (denied, `.env.example` excepted — and the sandbox turns a denied path into one no command can write) |
| Never hand-edit `pnpm-lock.yaml`                   | write hook; permission rule (asks)                                                                                                                              |
| Ask before changing `deploy/` and the server files | permission rule on `deploy/**`, `compose.yaml`, `Caddyfile`, `Dockerfile` (asks)                                                                                |
| Never commit a secret or server address            | write hook (refuses the write); `check-repo.mjs` in the stop hook and CI                                                                                        |
| No `rm -rf`, force push, `sudo`, server psql       | command hook (`guard-commands.mjs`, tested in `scripts/guard-commands.test.mjs`); `sudo` also a deny rule                                                       |
| Release and push ask first                         | permission rules (`git push`, `gh pr`, `pnpm release`, `node deploy/…`, `ssh`)                                                                                  |
| Design tokens, `Intl`, charts, `t()`               | `check-frontend.mjs` in `pnpm check` and CI                                                                                                                     |
| `AGENTS.md`, rules and skills stay short           | `check-repo.mjs`                                                                                                                                                |
| Code compiles before the session ends              | stop hook (`on-stop.mjs`, blocks once per session)                                                                                                              |
| Everything else in `AGENTS.md`                     | nothing — a request the agent keeps                                                                                                                             |

Three of the protected paths — registry components, migrations and the
lockfile — ask instead of refusing on purpose. A refusal also becomes a
sandbox rule that no process may write the path, and `pnpm exec shadcn add`,
`pnpm db:generate` and `pnpm add` are the reviewed way to write exactly those
files.

## Changing the rules without breaking them

The instructions are code and are checked like code: `AGENTS.md` may not pass
150 lines, a rule file 60, a skill 80 — `scripts/check-repo.mjs` fails the
build otherwise. Hooks and checkers have tests in `scripts/*.test.mjs`. So a
change to how the agent works follows the same path as a change to the app:
edit, run the checks, commit with a reason.

Every rule has one home — a memory note, `AGENTS.md`, a folder rule, a skill, a
hook or a checker — and the `tune-agent` skill is the procedure for choosing it
when the owner has corrected the agent twice about the same thing. The table
above says which rules are fences; a change that turns a fence back into a
sentence is the one to refuse.

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
