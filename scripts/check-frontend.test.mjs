// Fixture strings for every rule in check-frontend.mjs. The checker is what
// stands between a screen and the design system, so a rule that silently stops
// matching is worse than no rule at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkSourceFile, bundleRules, FIRST_PAINT_BUDGET_GZIP } from './check-frontend.mjs';

const SCREEN = 'frontend/src/routes/things.tsx';
const UI = 'frontend/src/components/ui/select.tsx';
const only = (rel, text) => checkSourceFile(rel, text);
const clean = (rel, text) =>
  assert.deepEqual(only(rel, text), [], `expected no complaint about ${rel}`);
const complains = (rel, text, about) => {
  const errors = only(rel, text);
  assert.ok(
    errors.some((e) => e.includes(about)),
    `expected a complaint about ${about}, got ${JSON.stringify(errors)}`,
  );
};

test('raw colours are refused outside the registry', () => {
  complains(SCREEN, 'const c = "#ff8800";', 'raw colour');
  complains(SCREEN, 'const c = "#f80";', 'raw colour');
  clean(SCREEN, '<a href="#main">skip</a>');
  clean(UI, 'const c = "#ff8800";');
});

test('Tailwind palette classes are refused outside the registry', () => {
  complains(SCREEN, '<p className="text-amber-700">late</p>', 'palette colour class');
  complains(SCREEN, '<p className="border-slate-200" />', 'palette colour class');
  clean(SCREEN, '<p className="text-warning" />');
  clean(SCREEN, '<p className="bg-chart-1" />');
  clean(UI, '<p className="text-amber-700" />');
});

test('dark: colour classes are refused; dark mode is a token swap', () => {
  complains(SCREEN, '<p className="bg-card dark:bg-muted" />', 'dark: colour class');
  complains(SCREEN, '<p className="dark:text-[#fff]" />', 'dark: colour class');
  clean(SCREEN, '<p className="dark:hidden" />');
  clean(UI, '<p className="dark:bg-muted" />');
});

test('Intl lives only in lib/format.ts', () => {
  complains(SCREEN, 'new Intl.NumberFormat("en-GB").format(n)', 'Intl belongs in lib/format.ts');
  complains(SCREEN, 'new Intl.DateTimeFormat("en-GB").format(d)', 'Intl belongs in lib/format.ts');
  clean('frontend/src/lib/format.ts', 'new Intl.NumberFormat("en-GB").format(n)');
});

test('recharts is importable only under components/charts/', () => {
  complains(SCREEN, `import { Bar } from 'recharts';`, 'recharts may only be imported');
  clean('frontend/src/components/charts/spend.tsx', `import { Bar } from 'recharts';`);
});

test('a raw Select is only for the vocabulary layer', () => {
  complains(SCREEN, `import { Select } from '@/components/ui/select';`, 'Choice component');
  clean(
    'frontend/src/components/inhouse/choice.tsx',
    `import { Select } from '@/components/ui/select';`,
  );
});

test('raw tables belong to the registry', () => {
  complains(SCREEN, '<table><tbody /></table>', 'raw <table>');
  clean(UI, '<table><tbody /></table>');
  clean(SCREEN, '<Table><TableBody /></Table>');
});

test('overlays have to be scrollable', () => {
  complains(SCREEN, '<DialogContent className="w-full">…</DialogContent>', 'overflow-y-auto');
  complains(SCREEN, '<SheetContent className="max-h-[90dvh]">…</SheetContent>', 'overflow-y-auto');
  clean(SCREEN, '<DialogContent className="max-h-[90dvh] overflow-y-auto">…</DialogContent>');
  clean(UI, '<DialogContent className="w-full">…</DialogContent>');
});

test('a form needs a submit button', () => {
  complains(SCREEN, '<form onSubmit={save}><Button>Save</Button></form>', 'type="submit"');
  clean(SCREEN, '<form onSubmit={save}><Button type="submit">Save</Button></form>');
});

test('the generated route tree is not ours to lint', () => {
  clean('frontend/src/routeTree.gen.ts', 'const c = "#ff8800"; // text-amber-700');
});

// The bundle rules read a directory rather than a string, so they get a
// throwaway dist/ of their own.
function withBuild(chunks, indexHtml) {
  const root = mkdtempSync(path.join(tmpdir(), 'check-frontend-'));
  const assets = path.join(root, 'dist', 'frontend', 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(root, 'dist', 'frontend', 'index.html'), indexHtml);
  for (const [name, body] of Object.entries(chunks)) writeFileSync(path.join(assets, name), body);
  try {
    return bundleRules(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const html = '<script type="module" crossorigin src="/assets/index-a1.js"></script>';

test('the bundle budget is skipped without a build', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'check-frontend-'));
  try {
    assert.deepEqual(bundleRules(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a lazily loaded chart library passes', () => {
  const errors = withBuild(
    {
      'index-a1.js': `import { x } from './vendor-b2.js';\nconst load = () => import('./charts-c3.js');`,
      'vendor-b2.js': 'export const x = 1;',
      'charts-c3.js': 'export const chart = "recharts";',
    },
    html,
  );
  assert.deepEqual(errors, []);
});

test('a chart library reachable statically fails', () => {
  const errors = withBuild(
    {
      'index-a1.js': `import { x } from './vendor-b2.js';`,
      'vendor-b2.js': 'export const x = "recharts";',
    },
    html,
  );
  assert.ok(
    errors.some((e) => e.includes('carries Recharts')),
    JSON.stringify(errors),
  );
});

test('too much javascript before the first screen fails', () => {
  // Random bytes so gzip cannot shrink them past the budget.
  const filler = Array.from({ length: FIRST_PAINT_BUDGET_GZIP + 50_000 }, () =>
    String.fromCharCode(32 + Math.floor(Math.random() * 90)),
  ).join('');
  const errors = withBuild({ 'index-a1.js': `const big = ${JSON.stringify(filler)};` }, html);
  assert.ok(
    errors.some((e) => e.includes('before the first screen')),
    JSON.stringify(errors),
  );
});

test('a build with no entry script is reported', () => {
  const errors = withBuild({}, '<html><body>nothing</body></html>');
  assert.ok(
    errors.some((e) => e.includes('no entry script')),
    JSON.stringify(errors),
  );
});
