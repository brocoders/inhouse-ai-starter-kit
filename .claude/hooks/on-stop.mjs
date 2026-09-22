#!/usr/bin/env node
// Stop: the cheap half of `pnpm check`, on the files this session touched,
// before the session says it is done.
//
// The point is timing. A session that ends on a type error hands the owner a
// broken tree and a report that says it works; the same error found here costs
// one more turn and nothing else. Only the fast checks run — hygiene and the
// compiler. Tests and the build belong to `pnpm check` and to CI.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runHook, projectDir, block } from './lib.mjs';

const firstLines = (text, n = 20) => text.split('\n').filter(Boolean).slice(0, n).join('\n');

function changedFiles(root) {
  const run = (args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch {
      return [];
    }
  };
  // Against HEAD, so files already staged count too, plus files that are new
  // and therefore invisible to `git diff`.
  return [
    ...new Set([
      ...run(['diff', '--name-only', 'HEAD']),
      ...run(['ls-files', '--others', '--exclude-standard']),
    ]),
  ];
}

await runHook(async (input) => {
  // Set when this hook already ran and the agent is finishing the follow-up
  // turn it asked for. Checking again here would be a loop with no exit.
  if (input.stop_hook_active) return;

  const root = projectDir(input);
  const changed = changedFiles(root).filter((f) => existsSync(path.join(root, f)));
  if (!changed.length) return;

  const hygiene = spawnSync('node', ['scripts/check-repo.mjs', ...changed], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (hygiene.status === 2) {
    block(
      `Before finishing — the repository check fails on what changed:\n\n${firstLines(hygiene.stderr)}`,
    );
  }

  // One compile per project, and only for the project whose sources moved:
  // typechecking the frontend because a server file changed costs ten seconds
  // for nothing.
  const projects = [
    ['server', 'server/tsconfig.json'],
    ['frontend', 'frontend/tsconfig.json'],
  ];
  for (const [dir, tsconfig] of projects) {
    const touched = changed.some((f) => f.startsWith(`${dir}/`) && /\.tsx?$/.test(f));
    if (!touched || !existsSync(path.join(root, tsconfig))) continue;
    const tsc = spawnSync('pnpm', ['exec', 'tsc', '-p', tsconfig, '--noEmit'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (tsc.status !== 0) {
      block(
        `Before finishing — the ${dir} does not compile:\n\n` +
          `${firstLines((tsc.stdout || '') + (tsc.stderr || ''))}\n\n` +
          'Fix these, then finish.',
      );
    }
  }
});
