#!/usr/bin/env node
// PreToolUse on Bash: the commands that can destroy something that cannot be
// got back, and the one thing each of them should have been instead.
//
// This is the second fence. The sandbox is the first one, and it is the one
// that catches what nobody thought of; this file catches the handful of
// commands that look reasonable in the moment and are not.
import { runHook, block } from './lib.mjs';

// Splitting on the operators that start a new command means a guarded command
// hidden behind `&&`, a pipe or a subshell is still seen.
const segments = (command) =>
  command
    .split(/\|\||&&|[;\n|]|\$\(|`/)
    .map((s) => s.trim())
    .filter(Boolean);

// Where deleting a whole tree is the normal thing to do: all three are rebuilt
// by a command, and none of them is ever the only copy of anything.
const DISPOSABLE = /^(?:\.\/)?(?:\.shots|dist|node_modules)(?:\/|$)/;

// Our own two scripts are allowed to reach the server's database, because they
// are the reviewed route for doing so — one pulls a copy, the other releases.
const OUR_DATABASE_SCRIPTS = /(?:scripts\/db-copy\.mjs|deploy\/release\.mjs)/;

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|::1|0\.0\.0\.0|\/)/i;

function checkRemove(segment) {
  if (!/\brm\b/.test(segment)) return null;
  const words = segment.split(/\s+/);
  const at = words.findIndex((w) => w === 'rm' || w.endsWith('/rm'));
  if (at < 0) return null;
  const flags = words.slice(at + 1).filter((w) => w.startsWith('-'));
  const recursive = flags.some((f) => /^-[^-]*r/i.test(f) || f === '--recursive');
  const forced = flags.some((f) => /^-[^-]*f/.test(f) || f === '--force');
  if (!recursive && !forced) return null;
  const targets = words.slice(at + 1).filter((w) => !w.startsWith('-'));
  const risky = targets.filter((t) => !DISPOSABLE.test(t.replace(/^['"]|['"]$/g, '')));
  if (!risky.length) return null;
  return (
    `\`rm -rf ${risky.join(' ')}\` deletes a tree that nothing rebuilds.\n` +
    'Inside this project only .shots/, dist/ and node_modules/ are disposable — each of those is\n' +
    'recreated by a command. For anything else: move it aside, or ask the owner.'
  );
}

function checkDatabaseReach(segment) {
  if (!/\b(?:psql|pg_dump|pg_restore)\b/.test(segment)) return null;
  if (OUR_DATABASE_SCRIPTS.test(segment)) return null;
  const hostFlag = /(?:^|\s)(?:-h|--host[= ])\s*([^\s'"]+)/.exec(segment);
  const uri = /postgres(?:ql)?:\/\/(?:[^@\s]*@)?([^:/\s'"]+)/.exec(segment);
  const host = hostFlag?.[1] ?? uri?.[1];
  if (!host || LOCAL_HOST.test(host)) return null;
  return (
    `That points \`${/pg_dump/.test(segment) ? 'pg_dump' : 'psql'}\` at ${host}, which is not this computer.\n` +
    'Production data is read by taking a copy, not by reaching into it: run `pnpm db:copy`\n' +
    '(add --anonymize before screenshots) and work locally. For a live question that a copy\n' +
    'cannot answer, use the `readonly` role over the SSH tunnel — see the deploy rules.'
  );
}

const PATTERNS = [
  {
    match: /(?:^|\s)sudo\s/,
    say:
      '`sudo` changes the machine outside this project, and this session cannot see what else\n' +
      'depends on it. If something genuinely needs administrator rights, hand the owner the\n' +
      'exact command as a numbered step and let them run it.',
  },
  {
    match: /docker\s+compose\b[^\n]*\bdown\b[^\n]*(?:\s-v\b|--volumes)/,
    say:
      '`docker compose down -v` deletes the volumes, which is the database.\n' +
      'To restart the app use `docker compose restart` or `down` without -v. To start over\n' +
      'locally, delete data/dev/ — that one is a copy and `pnpm db:copy` rebuilds it.',
  },
  {
    match: /git\s+push\b[^\n]*(?:--force(?!-with-lease)|(?:^|\s)-f(?:\s|$))/,
    say:
      'A force push overwrites what is on the remote, including work that is not in this\n' +
      'checkout. Push normally; if the branch has diverged, rebase and say so. If history\n' +
      "genuinely has to be rewritten, that is the owner's decision, not this session's.",
  },
  {
    match: /git\s+reset\b[^\n]*--hard/,
    say:
      '`git reset --hard` throws away every uncommitted change with no way back.\n' +
      'Use `git stash` to set the changes aside, or `git restore <file>` for the one file you\n' +
      'meant. `git reset` without --hard keeps the work.',
  },
  {
    match: /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/,
    say:
      'Piping a download straight into a shell runs code nobody has read, with your rights.\n' +
      'Download it to a file, read it, then run it — or install the thing with pnpm, brew or\n' +
      'apt, which is what the stack doc expects.',
  },
];

await runHook(async (input) => {
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) return;

  // The pipe into a shell is one command by design, so it is matched whole.
  for (const { match, say } of PATTERNS) {
    if (match.test(command)) block(say);
  }
  for (const segment of segments(command)) {
    const problem = checkRemove(segment) ?? checkDatabaseReach(segment);
    if (problem) block(problem);
  }
});
