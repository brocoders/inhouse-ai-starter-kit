// A dump that is cut in the wrong place loads half a database and the mistake
// only shows up as a missing row much later, so the splitter gets its own
// fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statements } from './sql-statements.mjs';

test('psql-only lines pg_dump 16 and 17 add are dropped', () => {
  const sql = [
    '\\restrict aBcD',
    'SET transaction_timeout = 0;',
    'SET statement_timeout = 0;',
    'CREATE TABLE thing (id text);',
    '\\unrestrict aBcD',
  ].join('\n');
  assert.deepEqual(statements(sql), ['SET statement_timeout = 0', 'CREATE TABLE thing (id text)']);
});

test('a semicolon inside a string does not end the statement', () => {
  const sql = `INSERT INTO note VALUES ('one; two', 'three');\nSELECT 1;`;
  assert.deepEqual(statements(sql), [`INSERT INTO note VALUES ('one; two', 'three')`, 'SELECT 1']);
});

test('a doubled quote inside a string is not the end of it', () => {
  const sql = `INSERT INTO note VALUES ('it''s here; really');\nSELECT 1;`;
  assert.equal(statements(sql).length, 2);
});

test('a quoted identifier may hold a semicolon', () => {
  assert.deepEqual(statements('SELECT "od; d" FROM t;'), ['SELECT "od; d" FROM t']);
});

test('a dollar-quoted function body survives whole', () => {
  const sql = `CREATE FUNCTION f() RETURNS int AS $$\nBEGIN\n  RETURN 1;\nEND;\n$$ LANGUAGE plpgsql;\nSELECT 2;`;
  const out = statements(sql);
  assert.equal(out.length, 2);
  assert.ok(out[0].includes('RETURN 1;'));
  assert.equal(out[1], 'SELECT 2');
});

test('a tagged dollar quote works the same way', () => {
  const sql = `SELECT $body$a; b$body$;\nSELECT 3;`;
  assert.deepEqual(statements(sql), ['SELECT $body$a; b$body$', 'SELECT 3']);
});

test('comments cannot end a statement', () => {
  const sql = `SELECT 1 -- ; not the end\n , 2;\n/* also ; not */ SELECT 4;`;
  const out = statements(sql);
  assert.equal(out.length, 2);
  assert.ok(out[1].endsWith('SELECT 4'));
});

test('a trailing statement without a semicolon is still returned', () => {
  assert.deepEqual(statements('SELECT 1;\nSELECT 2'), ['SELECT 1', 'SELECT 2']);
});

test('an empty dump gives nothing to run', () => {
  assert.deepEqual(statements('\n\n-- only a comment\n'), []);
});
