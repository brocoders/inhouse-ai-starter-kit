// One sentence, one place. Screens call t('items.title'); they never hold the
// words. A second language is then a second file beside en.ts and a line here,
// not a sweep through every component.
import { en, type Strings } from './en.ts';

export type TextKey = keyof Strings;

/** What goes into the {braces}. A count also chooses the plural form. */
export type TextParams = Record<string, string | number>;

const strings: Record<string, unknown> = en;

// One locale for the whole app, as the kit's rules say. It is set once from
// the signed-in person's settings so that "1 item / 2 items" follows the
// language's own rules and not English's, in the languages where they differ.
let locale = 'en';
const plurals = new Map<string, Intl.PluralRules>();

export function setTextLocale(next: string): void {
  locale = next;
}

function pluralFormOf(count: number): Intl.LDMLPluralRule {
  let rules = plurals.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    plurals.set(locale, rules);
  }
  return rules.select(count);
}

/**
 * The sentence for a key, with {name} filled in. A key whose value is a set of
 * plural forms picks one using `count`.
 *
 * A missing key returns the key itself rather than throwing: a wrong label is
 * a blemish, a screen that will not render is an outage.
 */
export function t(key: TextKey, params?: TextParams): string {
  const entry = strings[key];
  let text: string;
  if (typeof entry === 'string') {
    text = entry;
  } else if (entry && typeof entry === 'object') {
    const forms = entry as Partial<Record<Intl.LDMLPluralRule, string>>;
    const count = Number(params?.count ?? 0);
    text = forms[pluralFormOf(count)] ?? forms.other ?? String(key);
  } else {
    return String(key);
  }
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
