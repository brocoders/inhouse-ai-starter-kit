import { Line, LineChart, ResponsiveContainer } from 'recharts';

/**
 * A trend with no axes, no grid and no numbers: the shape of the last few
 * weeks, next to the figure it belongs to. Anything that needs a scale is a
 * chart, not a sparkline.
 */
export default function Sparkline({
  points,
  height = 36,
  tone = 'var(--color-primary)',
}: {
  points: number[];
  height?: number;
  tone?: string;
}) {
  const data = points.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="value" stroke={tone} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
