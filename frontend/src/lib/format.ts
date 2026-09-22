// The one place numbers, dates and amounts become text. Nothing else in the
// app may call Intl: two places formatting a date is two places to change when
// the app moves country, and one of them is always missed.
//
// The app has one locale and one time zone, both decided by the server and
// carried on `Me`. FormatProvider takes them from there and seeds this module,
// so a plain function can format without every caller passing settings down.
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { setTextLocale } from './i18n';

export type FormatSettings = { locale: string; timeZone: string };

/** Until the server answers. Neutral rather than American: the app is not. */
const fallback: FormatSettings = { locale: 'en-GB', timeZone: 'UTC' };

let current: FormatSettings = fallback;

const FormatContext = createContext<FormatSettings>(fallback);

/**
 * Seeds the formatters. Everything under it reads the same locale and zone,
 * and so does every plain call to the functions below — the settings are kept
 * in a module variable as well as in the context, because helpers that are not
 * components (a sort comparator, a CSV column) format too.
 */
export function FormatProvider({
  settings,
  children,
}: {
  settings?: FormatSettings | undefined;
  children: ReactNode;
}) {
  const value = settings ?? fallback;
  // Assigned during render on purpose: the children about to render must
  // already see the new locale, and an effect would leave the first paint
  // formatted with the old one.
  if (value.locale !== current.locale || value.timeZone !== current.timeZone) {
    current = value;
    caches.clear();
    setTextLocale(value.locale);
  }
  return createElement(FormatContext.Provider, { value }, children);
}

/** The settings in force, for the rare component that needs them literally. */
export function useFormatSettings(): FormatSettings {
  return useContext(FormatContext);
}

// Intl formatters are expensive to build and cheap to keep, and a list redraws
// thousands of cells; one per shape, thrown away when the settings change.
const caches = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
function dateFormat(key: string, options: Intl.DateTimeFormatOptions) {
  let made = caches.get(key) as Intl.DateTimeFormat | undefined;
  if (!made) {
    made = new Intl.DateTimeFormat(current.locale, {
      timeZone: current.timeZone,
      ...options,
    });
    caches.set(key, made);
  }
  return made;
}
function numberFormat(key: string, options: Intl.NumberFormatOptions) {
  let made = caches.get(key) as Intl.NumberFormat | undefined;
  if (!made) {
    made = new Intl.NumberFormat(current.locale, options);
    caches.set(key, made);
  }
  return made;
}

/** An instant or a calendar day as "18 Sept 2026". */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return dateFormat('date', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** An instant as "18 Sept 2026, 14:05", in the app's time zone. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return dateFormat('datetime', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const relativeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
  ['second', 1000],
];

/** "2 hours ago", "in 3 days". How a history line says when. */
export function formatRelative(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return '—';
  const difference = date.getTime() - now.getTime();
  const format = new Intl.RelativeTimeFormat(current.locale, {
    numeric: 'auto',
    style: 'short',
  });
  for (const [unit, size] of relativeUnits) {
    if (Math.abs(difference) >= size || unit === 'second')
      return format.format(Math.round(difference / size), unit);
  }
  return format.format(0, 'second');
}

/** A count of things. Never an amount of money — that is formatAmount. */
export function formatNumber(value: number, fractionDigits = 0): string {
  return numberFormat(`n${fractionDigits}`, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** 12,345 → "12K". Axis ticks and tight cells only. */
export function formatCompact(value: number): string {
  return numberFormat('compact', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * An amount held as a whole number of its smallest unit — cents, grams,
 * minutes — shown the way that unit is written.
 *
 * Amounts are integers everywhere in this kit, because a price that is a
 * floating-point number eventually adds up to the wrong total. With a currency
 * the currency's own number of decimals is used; without one the number is
 * shown as it is, optionally with a unit after it.
 */
export function formatAmount(
  minor: number,
  currency?: string | undefined,
  options?: { unit?: string; exponent?: number } | undefined,
): string {
  if (currency) {
    const digits = currencyDigits(currency);
    return numberFormat(`c${currency}`, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(minor / 10 ** digits);
  }
  const exponent = options?.exponent ?? 0;
  const text = numberFormat(`a${exponent}`, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent);
  return options?.unit ? `${text} ${options.unit}` : text;
}

const digitsByCurrency = new Map<string, number>();
function currencyDigits(currency: string): number {
  let digits = digitsByCurrency.get(currency);
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    digitsByCurrency.set(currency, digits);
  }
  return digits;
}

/** File sizes, for attachments and the health page's disk line. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${numberFormat(unit === 0 ? 'n0' : 'n1', {
    minimumFractionDigits: unit === 0 ? 0 : 1,
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(size)} ${units[unit]}`;
}

/**
 * Today as a calendar day ("2026-09-22") in the app's time zone, not the
 * browser's. Someone travelling must see the same "today" as the office.
 */
export function today(at: Date = new Date()): string {
  const parts = dateFormat('day', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** A calendar day `days` away from another, staying a calendar day throughout. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // A calendar day has no time of day; midday keeps it on its own date in
  // every time zone the app might be shown in.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
