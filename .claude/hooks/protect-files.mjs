#!/usr/bin/env node
// PreToolUse on Edit and Write: the files that are not ours to change, and the
// content that must never reach the disk.
//
// Every rule here is one of the "never" lines in AGENTS.md. Writing them down
// twice would be a second home for the same rule, so this file enforces them
// rather than restating them: the message points back at what to do instead.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runHook, projectDir, block, insideProject } from './lib.mjs';
import { SECRETS } from '../../scripts/check-repo.mjs';

const RULES = [
  {
    // Registry components are generated, not maintained. A change here is lost
    // the next time the component is re-added, and it is the reason the design
    // system stops being one thing.
    when: (rel) => rel.startsWith('frontend/src/components/ui/'),
    say: (rel) =>
      `${rel} comes from the shadcn registry and is never edited by hand.\n` +
      'Change it by re-adding the component (`pnpm exec shadcn add <name>`), or wrap it in\n' +
      'frontend/src/components/inhouse/ where the app-specific behaviour belongs.',
  },
  {
    // A migration that has run somewhere is a fact about that database. Editing
    // it makes the file and the database disagree, silently and for good.
    when: (rel, { exists }) => /^server\/drizzle\/.*\.sql$/.test(rel) && exists,
    say: (rel) =>
      `${rel} already exists, and a migration that exists has probably been applied somewhere.\n` +
      'Changing it makes the file and the database disagree for good.\n' +
      'Change the schema in server/src/db/ and run `pnpm db:generate` to write the next migration instead.',
  },
  {
    when: (rel) => /(^|\/)\.env($|\.)/.test(rel) && path.basename(rel) !== '.env.example',
    say: (rel) =>
      `${rel} holds this machine's secrets and is not committed, so an agent editing it\n` +
      'is an agent writing a secret it cannot see the consequences of.\n' +
      'Add the key and a description to .env.example and ask the owner to fill in the value.',
  },
  {
    when: (rel) => rel === 'pnpm-lock.yaml',
    say: () =>
      'pnpm-lock.yaml is written by pnpm, not by hand — an edited lockfile installs something\n' +
      'nobody chose. Run `pnpm add <package>` or `pnpm install` and commit what it produces.',
  },
  {
    when: (rel) => rel === '.git' || rel.startsWith('.git/'),
    say: (rel) => `${rel} is Git's own storage. Use a git command; hand-editing it loses history.`,
  },
];

await runHook(async (input) => {
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;
  const root = projectDir(input);
  const rel = insideProject(root, filePath);

  if (rel === null) {
    block(
      `${filePath} is outside this project.\n` +
        'Work inside the project directory. If a file genuinely belongs elsewhere (a machine-wide\n' +
        'setting, a key), hand the owner the exact steps instead of writing it yourself.',
    );
  }

  const exists = existsSync(path.resolve(root, filePath));
  for (const rule of RULES) {
    if (rule.when(rel, { exists })) block(rule.say(rel));
  }

  // The same list check-repo.mjs uses, applied before the write rather than
  // after it: a secret that never lands on disk cannot be committed by
  // accident, and the value is never echoed back.
  const written = [input.tool_input?.content, input.tool_input?.new_string].filter(
    (v) => typeof v === 'string',
  );
  for (const text of written) {
    for (const [kind, pattern] of SECRETS) {
      if (pattern.test(text)) {
        block(
          `That write puts what looks like a ${kind} into ${rel}.\n` +
            'Secrets live in .env (ignored by Git) and in ~/.config/inhouse/<project>/, never in a\n' +
            'tracked file. Put a placeholder here and the real value there.',
        );
      }
    }
  }
});
