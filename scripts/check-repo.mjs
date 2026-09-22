#!/usr/bin/env node
// Repository hygiene, dependency-free. Runs on every change, in a hook and
// in CI, before anything else: it is cheap and it applies to documentation
// as much as to code.
//
//   node scripts/check-repo.mjs            # every Git-tracked file
//   node scripts/check-repo.mjs a.ts b.md  # just these (the hook's path)
//
// Two families of rule. Secrets: a routable IP address, a private key, a
// forge or bot token, a cloud access key. The value is never echoed — the
// report names the file and the kind. Budgets: the always-loaded agent
// instructions stay short enough to be read, so the rules in them are.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LINE_BUDGETS = { 'AGENTS.md': 150, 'CLAUDE.md': 150 };
const RULE_LINE_BUDGET = 60; // each .claude/rules/*.md
const SKILL_LINE_BUDGET = 80; // each SKILL.md body

const SECRETS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['Telegram bot token', /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['Resend key', /\bre_[A-Za-z0-9]{20,}\b/],
  ['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/],
  ['Tailscale hostname', /\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/i],
];
const IPV4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
const ALLOWED_IP = (a, b) =>
  a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ||
  (a === 169 && b === 254) || (a === 192 && b === 0) || (a === 198 && (b === 51 || b === 18 || b === 19)) ||
  (a === 203 && b === 0) || a >= 224;
const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|pdf|zip|gz|lock)$/i;
const SKIP = [/^pnpm-lock\.yaml$/, /^node_modules\//, /^dist\//];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString();
  return out.split('\0').filter(Boolean);
}

function checkSecrets(rel, text, errors) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/inhouse-allow-secret/.test(line)) return;
    for (const [kind, re] of SECRETS) {
      if (re.test(line)) errors.push(`${rel}:${i + 1}: looks like a ${kind}`);
    }
    for (const m of line.matchAll(IPV4)) {
      const [a, b, c, d] = m.slice(1).map(Number);
      if ([a, b, c, d].some((n) => n > 255)) continue;
      if (/\d\.\d+\.\d+\.\d+\.\d/.test(line)) continue; // versions like 1.2.3.4.5
      if (!ALLOWED_IP(a, b)) errors.push(`${rel}:${i + 1}: routable IP address`);
    }
  });
}

function checkBudgets(rel, text, errors) {
  const lines = text.split('\n').length;
  const base = path.basename(rel);
  if (LINE_BUDGETS[base] && rel === base && lines > LINE_BUDGETS[base]) {
    errors.push(`${rel}: ${lines} lines, budget ${LINE_BUDGETS[base]} — move procedures to skills, history to docs/`);
  }
  if (/^\.claude\/rules\/[^/]+\.md$/.test(rel) && lines > RULE_LINE_BUDGET) {
    errors.push(`${rel}: ${lines} lines, budget ${RULE_LINE_BUDGET}`);
  }
  if (/^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(rel) && lines > SKILL_LINE_BUDGET) {
    errors.push(`${rel}: ${lines} lines, budget ${SKILL_LINE_BUDGET} — link a reference file instead`);
  }
}

const args = process.argv.slice(2);
const files = (args.length ? args.map((f) => path.relative(ROOT, path.resolve(f))) : trackedFiles()).filter(
  (rel) => !SKIP.some((re) => re.test(rel)) && !BINARY.test(rel) && existsSync(path.join(ROOT, rel)),
);
const errors = [];
for (const rel of files) {
  let text;
  try {
    text = readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;
  checkSecrets(rel, text, errors);
  checkBudgets(rel, text, errors);
}
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s). Nothing was echoed; open the file to see the value.`);
  process.exit(2);
}
console.log(`check-repo: ${files.length} file(s) clean`);
