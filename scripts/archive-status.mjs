#!/usr/bin/env node
// Keeps docs/STATUS.md bounded: everything under "# Recent entries" beyond
// the newest N second-level headings moves to docs/status-archive/YYYY-MM.md.
//   node scripts/archive-status.mjs --keep 10
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const STATUS = path.join(ROOT, 'docs', 'STATUS.md');
const keep = Number(process.argv[process.argv.indexOf('--keep') + 1] || 10);
const text = readFileSync(STATUS, 'utf8');
const marker = '\n# Recent entries\n';
const at = text.indexOf(marker);
if (at < 0) throw new Error('docs/STATUS.md has no "# Recent entries" heading');
const head = text.slice(0, at + marker.length);
const entries = text
  .slice(at + marker.length)
  .split(/\n(?=## )/)
  .map((e) => e.trim())
  .filter(Boolean);
if (entries.length <= keep) {
  console.log(`archive-status: ${entries.length} entries, nothing to move`);
  process.exit(0);
}
const stay = entries.slice(0, keep);
const move = entries.slice(keep);
const month = new Date().toISOString().slice(0, 7);
const dir = path.join(ROOT, 'docs', 'status-archive');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${month}.md`);
if (!existsSync(file)) writeFileSync(file, `# Status archive ${month}\n\n`);
appendFileSync(file, move.join('\n\n') + '\n\n');
writeFileSync(STATUS, head + '\n' + stay.join('\n\n') + '\n');
console.log(`archive-status: moved ${move.length} entries to docs/status-archive/${month}.md`);
