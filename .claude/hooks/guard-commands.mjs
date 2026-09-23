#!/usr/bin/env node
// PreToolUse on Bash: the commands that can destroy something that cannot be
// got back, and the one thing each of them should have been instead.
//
// This is the second fence. The sandbox is the first one, and it is the one
// that catches what nobody thought of; this file catches the handful of
// commands that look reasonable in the moment and are not. The decision lives
// in lib-guard.mjs so that scripts/guard-commands.test.mjs can prove it.
import { runHook, block } from './lib.mjs';
import { judge } from './lib-guard.mjs';

await runHook(async (input) => {
  const problem = judge(input.tool_input?.command);
  if (problem) block(problem);
});
