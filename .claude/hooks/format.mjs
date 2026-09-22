#!/usr/bin/env node
// PostToolUse on Edit and Write: format the file that was just written.
//
// Formatting is not a judgment call, so it should never be a review comment or
// a failed check at the end of a session. It happens here, silently, the
// moment the file changes.
//
// This hook never fails the tool it follows. The edit already happened; a
// formatter that is missing, slow or unhappy is not a reason to report an
// error about the edit, and `pnpm check` runs `format:check` anyway.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runHook, projectDir, insideProject } from './lib.mjs';

// The extensions Prettier owns in this repository. Anything else — a .sql
// migration, a .png, a .sh — it would refuse or reformat surprisingly.
const HANDLED = /\.(?:m?[jt]sx?|cjs|cts|mts|json|jsonc|md|css|s[ca]ss|html|ya?ml)$/i;

await runHook(async (input) => {
  const filePath = input.tool_input?.file_path;
  if (!filePath || !HANDLED.test(filePath)) return;
  const root = projectDir(input);
  if (insideProject(root, filePath) === null) return;

  spawnSync(
    'pnpm',
    ['exec', 'prettier', '--write', '--log-level', 'warn', path.resolve(root, filePath)],
    {
      cwd: root,
      stdio: 'ignore',
      timeout: 20_000,
    },
  );
});
