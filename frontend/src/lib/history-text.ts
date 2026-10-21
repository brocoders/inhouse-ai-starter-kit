// How a stored value is written in a history sentence when the screen has
// nothing better to say about it. Pure, so it runs under `node --test`:
//
//   node --test frontend/src/lib/history-text.ts
//
// The first real app showed "changed lastExit from [object Object] to
// [object Object]": a JSON column, written with String(). Nothing here is
// clever — an object is named by the one field a person would name it by,
// a list by its members, an id by the fact that it is one.

export type HistoryWords = {
  /** For null, undefined and the empty string. */
  empty: string;
  /** For a value that is the id of another record. */
  record: string;
  yes: string;
  no: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_FIELDS = ['name', 'title', 'label', 'email', 'id'];
const MAX_LIST = 5;

export function describeValue(value: unknown, words: HistoryWords): string {
  if (value === null || value === undefined || value === '') return words.empty;
  if (typeof value === 'boolean') return value ? words.yes : words.no;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return UUID.test(value) ? words.record : value;
  if (Array.isArray(value)) {
    const shown = value.slice(0, MAX_LIST).map((item) => describeValue(item, words));
    return value.length > MAX_LIST ? `${shown.join(', ')}, …` : shown.join(', ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const field of NAME_FIELDS) {
      const named = record[field];
      if (typeof named === 'string' && named !== '') return describeValue(named, words);
      if (typeof named === 'number') return String(named);
    }
    const keys = Object.keys(record);
    if (!keys.length) return words.empty;
    // "a: 1, b: yes" — short enough to read, honest about what was there.
    return keys
      .slice(0, MAX_LIST)
      .map((key) => `${key}: ${describeValue(record[key], words)}`)
      .join(', ');
  }
  return String(value);
}
