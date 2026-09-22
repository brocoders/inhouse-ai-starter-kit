import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A quantity, shown the way its unit is written. Amounts are whole numbers of
 * their smallest unit everywhere in this kit — cents, grams, minutes — because
 * a quantity kept as a decimal eventually adds up to the wrong total.
 *
 * Always tabular: a column of figures that do not line up cannot be compared
 * at a glance, which is the only reason to put them in a column.
 */
export function Amount({
  value,
  currency,
  unit,
  exponent,
  signed = false,
  className,
}: {
  /** A whole number of the smallest unit. */
  value: number;
  /** An ISO currency code; its own number of decimals is then used. */
  currency?: string;
  /** What is being counted, when it is not money: "kg", "h", "people". */
  unit?: string;
  /** How many of the digits are decimals, when there is no currency. */
  exponent?: number;
  /** Colour a positive figure as a gain and a negative one as a loss. */
  signed?: boolean;
  className?: string;
}) {
  const text = formatAmount(value, currency, {
    ...(unit !== undefined ? { unit } : {}),
    ...(exponent !== undefined ? { exponent } : {}),
  });
  return (
    <span
      className={cn(
        'tabular-nums',
        signed && value > 0 && 'text-positive',
        signed && value < 0 && 'text-negative',
        className,
      )}
    >
      {signed && value > 0 ? '+' : ''}
      {text}
    </span>
  );
}
