// Fixture strings for every rule in check-frontend.mjs. The checker is what
// stands between a screen and the design system, so a rule that silently stops
// matching is worse than no rule at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkSourceFile,
  bundleRules,
  BEFORE_ANY_SCREEN_BUDGET_GZIP,
  SCREEN_OWN_BUDGET_GZIP,
  byName,
} from './check-frontend.mjs';

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
  clean(SCREEN, '<a href="#main">{t(\'skip\')}</a>');
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
  complains(SCREEN, '<form onSubmit={save}><Button>{t("save")}</Button></form>', 'type="submit"');
  clean(SCREEN, '<form onSubmit={save}><Button type="submit">{t("save")}</Button></form>');
});

test('words typed straight into JSX go through t()', () => {
  complains(SCREEN, '<Button type="submit">Save</Button>', 'render it with t()');
  complains(
    SCREEN,
    '<p className="text-sm">\n  Choose the days to show.\n</p>',
    'render it with t()',
  );
  complains(
    'frontend/src/components/inhouse/period-picker.tsx',
    '<Label>From</Label>',
    'render it with t()',
  );
  clean(SCREEN, '<Button type="submit">{t(\'action.save\')}</Button>');
  clean(SCREEN, '<span>{count} ·</span>');
  clean(SCREEN, 'const x = items.map((i) => i.name);');
  clean(SCREEN, "cn(value > 0 && 'text-positive', signed && value < 0 && 'text-negative')");
  clean(SCREEN, 'const [v, setV] = useState<string>("");');
  // The registry and non-screen code are out of scope.
  clean(UI, '<Button>Close</Button>');
  clean('frontend/src/components/shell/nav.tsx', '<a>Home</a>');
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
  const filler = Array.from({ length: BEFORE_ANY_SCREEN_BUDGET_GZIP * 2 }, () =>
    String.fromCharCode(32 + Math.floor(Math.random() * 90)),
  ).join('');
  const errors = withBuild({ 'index-a1.js': `const big = ${JSON.stringify(filler)};` }, html);
  assert.ok(
    errors.some((e) => e.includes('before any screen')),
    JSON.stringify(errors),
  );
});

const noise = (length) =>
  Array.from({ length }, () => String.fromCharCode(32 + Math.floor(Math.random() * 90))).join('');

test('a screen heavier than its own budget is named, and the shell is not blamed', () => {
  const errors = withBuild(
    {
      'index-a1.js':
        "import { x } from './vendor-b2.js';\nconst s = () => import(`./reports-c3d4e5f6.js`);",
      'vendor-b2.js': 'export const x = 1;',
      'reports-c3d4e5f6.js': `import { x } from './vendor-b2.js';\nconst big = ${JSON.stringify(noise(SCREEN_OWN_BUDGET_GZIP + 20_000))};`,
    },
    html,
  );
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0], /"reports" screen is \d+ KB gzip of its own/);
  assert.ok(!errors[0].includes('before any screen'));
});

test('what two screens share is counted once, before any screen, not against either', () => {
  const errors = withBuild(
    {
      'index-a1.js':
        'const a = () => import(`./items-c3d4e5f6.js`); const b = () => import(`./people-a9b8c7d6.js`);',
      'items-c3d4e5f6.js': "import { x } from './inhouse-f1e2d3c4.js';",
      'people-a9b8c7d6.js': "import { x } from './inhouse-f1e2d3c4.js';",
      'inhouse-f1e2d3c4.js': `export const x = ${JSON.stringify(noise(SCREEN_OWN_BUDGET_GZIP + 20_000))};`,
    },
    html,
  );
  assert.deepEqual(errors, []);
});

test('a screen is measured on top of the shell, and shared code is the shell’s', () => {
  const errors = withBuild(
    {
      'index-a1.js':
        "import { x } from './vendor-b2.js';\nconst s = () => import(`./items-c3d4e5f6.js`);",
      // Heavy, but in the shell: the screen that imports it does not pay twice.
      'vendor-b2.js': `export const x = ${JSON.stringify(noise(SCREEN_OWN_BUDGET_GZIP + 20_000))};`,
      'items-c3d4e5f6.js': "import { x } from './vendor-b2.js';\nexport const screen = x;",
    },
    html,
  );
  assert.deepEqual(errors, []);
});

test('a piece a screen loads on demand is outside both budgets', () => {
  const errors = withBuild(
    {
      'index-a1.js': 'const s = () => import(`./home-c3d4e5f6.js`);',
      'home-c3d4e5f6.js': 'const chart = () => import(`./sparkline-a9b8c7d6.js`);',
      'sparkline-a9b8c7d6.js': `const big = ${JSON.stringify(noise(SCREEN_OWN_BUDGET_GZIP + 20_000))};`,
    },
    html,
  );
  assert.deepEqual(errors, []);
});

test('a build with no entry script is reported', () => {
  const errors = withBuild({}, '<html><body>nothing</body></html>');
  assert.ok(
    errors.some((e) => e.includes('no entry script')),
    JSON.stringify(errors),
  );
});

test('a row, link or button under 44 px is refused where a finger lands', () => {
  complains(SCREEN, '<li className="flex h-9 items-center">{t(\'x\')}</li>', 'under 44 px');
  complains(SCREEN, '<Link to="/" className="min-h-10 px-2">{t(\'x\')}</Link>', 'under 44 px');
  complains(SCREEN, '<button className="size-8 rounded-md" />', 'under 44 px');
  complains(
    'frontend/src/components/inhouse/row.tsx',
    '<li className="min-h-8 sm:min-h-10" />',
    'under 44 px',
  );
  clean(SCREEN, '<li className="flex min-h-14 items-center sm:min-h-10" />');
  clean(SCREEN, '<li className="min-h-11" />');
  clean(SCREEN, '<a className="h-14 w-full" />');
  // A div is not a target; a bar inside a row may be as thin as it likes.
  clean(SCREEN, '<div className="h-8 flex-1" />');
  // The desktop sidebar is hidden on the phone and keeps its 36 px rows.
  clean('frontend/src/components/shell/app-sidebar.tsx', '<Link className="flex h-9" />');
  clean(UI, '<button className="h-8" />');
});

test('files are visited in one order whatever locale the machine has', () => {
  const names = ['Zebra.tsx', 'ärger.tsx', 'apple.tsx', 'Äpfel.tsx'].map((name) => ({ name }));
  // English order: the umlauts sort with their base letters, not after z as
  // Swedish would have them.
  assert.deepEqual(
    [...names].sort(byName).map((n) => n.name),
    ['Äpfel.tsx', 'apple.tsx', 'ärger.tsx', 'Zebra.tsx'],
  );
  assert.deepEqual(
    [...names].sort(byName).map((n) => n.name),
    [...names].sort((a, b) => a.name.localeCompare(b.name, 'en')).map((n) => n.name),
  );
});
