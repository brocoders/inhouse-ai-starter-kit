#!/usr/bin/env node
// SessionStart: the two facts every session needs before it does anything.
//
// Whatever this prints becomes part of the session's context, so it prints the
// current state and the profile and then stops. Everything else — the rules,
// the commands, the history — is already in AGENTS.md and docs/, and repeating
// it here would cost context in every single session to say nothing new.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { runHook, projectDir } from './lib.mjs';

await runHook(async (input) => {
  const root = projectDir(input);

  const status = path.join(root, 'docs', 'STATUS.md');
  if (existsSync(status)) {
    const text = readFileSync(status, 'utf8');
    const end = text.indexOf('\n# Recent entries');
    process.stdout.write((end === -1 ? text : text.slice(0, end)).trim() + '\n');
    // Which version of the file this is. Two sessions in one checkout is how
    // the first real project got a stale snapshot: the other chat released and
    // wrote the file while this one was reading its copy of it.
    const last = spawnSync('git', ['log', '-1', '--format=%h %cd', '--date=short', '--', status], {
      cwd: root,
      encoding: 'utf8',
    });
    const stamp = last.status === 0 ? last.stdout.trim() : '';
    if (stamp) {
      process.stdout.write(
        `\n(docs/STATUS.md as of commit ${stamp}. Before editing it, run \`git log -1 -- docs/STATUS.md\`;` +
          ' a newer commit means another session has been here — re-read the file first.)\n',
      );
    }
  }

  const configPath = path.join(root, 'inhouse.config.json');
  if (!existsSync(configPath)) {
    process.stdout.write('\nThere is no inhouse.config.json yet — run the /setup skill.\n');
    return;
  }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    process.stdout.write(
      `\nProfile: ${config.profile}` +
        (config.profile === 'team'
          ? ' — open a pull request and stop; someone else merges.\n'
          : ' — you review, merge and release your own work.\n'),
    );
  } catch {
    process.stdout.write(
      '\ninhouse.config.json is not valid JSON; scripts that read it will stop.\n',
    );
  }
});
