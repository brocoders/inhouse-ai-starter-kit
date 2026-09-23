// A list as a file somebody can open in Excel or Numbers.
//
// RFC 4180, because that is what spreadsheets read: fields separated by commas,
// lines by CRLF, and a field quoted — with its own quotes doubled — whenever it
// holds a comma, a quote or a line break. A byte-order mark goes first, since
// without it Excel on Windows reads the file as the local code page and turns
// every accented name into mojibake.
//
// Values are written as given. Format them before they get here — a date as
// `YYYY-MM-DD` sorts and filters as a date in every spreadsheet, whereas "18
// Sept 2026" is only text.

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => string | number | boolean | null | undefined;
};

const BOM = '﻿';

// A cell that starts with one of these is a formula to a spreadsheet, and a
// title somebody typed as `=HYPERLINK(...)` would run as one on a colleague's
// machine. A leading apostrophe makes it text again; the spreadsheet hides it.
const FORMULA_START = /^[=+\-@\t\r]/;

function field(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file as text, header line first, BOM included. */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const lines = [columns.map((column) => field(column.header)).join(',')];
  for (const row of rows) lines.push(columns.map((column) => field(column.value(row))).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Hand the file to the browser as a download. Nothing leaves the machine. */
export function downloadCsv<Row>(
  filename: string,
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // The click has already handed the blob over; the address is not needed
  // after this turn of the event loop.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
