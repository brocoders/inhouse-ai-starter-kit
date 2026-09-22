// Splits a plain pg_dump into statements that can be replayed one at a time.
//
// psql is not in the picture when the copy goes into the embedded database, so
// two things have to happen here that psql would otherwise do: drop the
// backslash commands pg_dump 16 and 17 wrap the file in (\restrict,
// \unrestrict), and cut the file at the semicolons that actually end a
// statement — not the ones inside a string, a quoted name, a comment or a
// dollar-quoted function body.

const DROPPED_LINE = [
  /^\s*\\(?:restrict|unrestrict|connect|encoding)\b/,
  // pg_dump 17 emits this and older servers reject it; it is a client-side
  // safety net we do not need for a local copy.
  /^\s*SET\s+transaction_timeout\b/i,
];

// A stretch of the file that is nothing but comments and blank lines is not a
// statement; a dump ends with several of them.
const hasCode = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim() !== '';

export function statements(sql) {
  const kept = sql
    .split('\n')
    .filter((line) => !DROPPED_LINE.some((re) => re.test(line)))
    .join('\n');

  const out = [];
  let start = 0;
  let i = 0;
  while (i < kept.length) {
    const c = kept[i];
    if (c === '-' && kept[i + 1] === '-') {
      const nl = kept.indexOf('\n', i);
      i = nl === -1 ? kept.length : nl + 1;
    } else if (c === '/' && kept[i + 1] === '*') {
      const end = kept.indexOf('*/', i + 2);
      i = end === -1 ? kept.length : end + 2;
    } else if (c === "'" || c === '"') {
      i += 1;
      while (i < kept.length) {
        if (kept[i] === '\\') i += 2;
        else if (kept[i] === c) {
          i += 1;
          if (kept[i] === c)
            i += 1; // a doubled quote is one character, not the end
          else break;
        } else i += 1;
      }
    } else if (c === '$') {
      // $$ … $$ and $tag$ … $tag$ hold function bodies, semicolons and all.
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(kept.slice(i));
      if (tag) {
        const end = kept.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? kept.length : end + tag[0].length;
      } else i += 1;
    } else if (c === ';') {
      const text = kept.slice(start, i).trim();
      if (hasCode(text)) out.push(text);
      start = i + 1;
      i += 1;
    } else i += 1;
  }
  const tail = kept.slice(start).trim();
  if (hasCode(tail)) out.push(tail);
  return out;
}
