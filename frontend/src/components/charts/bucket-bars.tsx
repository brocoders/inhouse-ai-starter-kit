import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCompact } from '@/lib/format';

export type Bucket = { label: string; value: number; open?: boolean };

/**
 * One bar per stretch of time — a week of items closed, a month of hours —
 * with the bucket still running drawn faintly so nobody reads a half-finished
 * week as a fall.
 *
 * Recharts lives only in this folder and is only ever reached through the lazy
 * wrappers in index.ts, so the charting library is not in the first download.
 */
export default function BucketBars({
  buckets,
  height = 176,
}: {
  buckets: Bucket[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={buckets} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-muted)' }}
          contentStyle={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => formatCompact(Number(value ?? 0))}
        />
        <Bar dataKey="value" radius={4} maxBarSize={28}>
          {buckets.map((bucket) => (
            <Cell
              key={bucket.label}
              fill="var(--color-primary)"
              fillOpacity={bucket.open ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
