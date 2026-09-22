// Shared plumbing for the hooks. Claude Code feeds a hook one JSON object on
// stdin and reads its exit code: 0 lets the tool run, 2 stops it and shows
// whatever the hook wrote to stderr to the agent.
//
// Everything here is deliberately forgiving. A hook that crashes on a payload
// it did not expect would block every edit in the session, which is a far
// worse failure than the one it was guarding against — so an unexpected error
// lets the tool through and says so.
import path from 'node:path';

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// CLAUDE_PROJECT_DIR is set for every hook; `cwd` in the payload is the
// session's directory, which is the same thing unless someone moved.
export function projectDir(input) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
}

/** Stop the tool and tell the agent why. The text is read by the agent, so it
 * says what to do instead, not just what was refused. */
export function block(message) {
  process.stderr.write(message.trim() + '\n');
  process.exit(2);
}

export function allow() {
  process.exit(0);
}

/** Wraps a hook body so that a bug in it can never wedge a session. */
export async function runHook(body) {
  try {
    await body(await readHookInput());
  } catch (error) {
    // Not `block`: a broken guard must not become a broken editor.
    process.stderr.write(`hook error (letting the tool run): ${error.message}\n`);
    process.exit(0);
  }
  process.exit(0);
}

/** POSIX-style path relative to the project, or null when it is outside it. */
export function insideProject(root, filePath) {
  const rel = path.relative(root, path.resolve(root, filePath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}
