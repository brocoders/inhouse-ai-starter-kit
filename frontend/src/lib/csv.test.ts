// The quoting is the whole of CSV, and every rule in it is one a real title
// or note will eventually break.
//
//   node --test frontend/src/lib/csv.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toCsv, type CsvColumn } from './csv.ts';

type Row = { name: string; note: string | null; count: number };
const columns: CsvColumn<Row>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Note', value: (row) => row.note },
  { header: 'Count', value: (row) => row.count },
];
const BOM = '﻿';

describe('a CSV file', () => {
  it('starts with a byte-order mark and ends every line with CRLF', () => {
    const text = toCsv([{ name: 'Rita', note: null, count: 2 }], columns);
    assert.equal(text, `${BOM}Name,Note,Count\r\nRita,,2\r\n`);
  });

  it('quotes a field with a comma, a quote or a line break, and doubles the quotes', () => {
    const text = toCsv(
      [
        { name: 'Berg, Tomas', note: 'said "later"', count: 1 },
        { name: 'Two\nlines', note: 'carriage\rreturn', count: 0 },
      ],
      columns,
    );
    const lines = text.slice(BOM.length).split('\r\n');
    assert.equal(lines[1], '"Berg, Tomas","said ""later""",1');
    assert.equal(lines[2], '"Two\nlines","carriage\rreturn",0');
  });

  it('leaves plain text and numbers alone, accents included', () => {
    const text = toCsv([{ name: 'Salmiņa', note: 'ok', count: -3 }], columns);
    assert.equal(text.slice(BOM.length).split('\r\n')[1], 'Salmiņa,ok,-3');
  });

  it('keeps a typed formula as text, so a spreadsheet does not run it', () => {
    const text = toCsv([{ name: '=HYPERLINK("x")', note: '@SUM(A1)', count: 5 }], columns);
    assert.equal(text.slice(BOM.length).split('\r\n')[1], `"'=HYPERLINK(""x"")",'@SUM(A1),5`);
  });

  it('writes only the header for no rows', () => {
    assert.equal(toCsv([], columns), `${BOM}Name,Note,Count\r\n`);
  });
});
