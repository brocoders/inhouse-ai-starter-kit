// Charts are loaded when a screen that has one is opened, never before.
//
// Recharts is about as large as the rest of the app put together, and most
// screens have no chart at all. Importing it only from this folder, and only
// through React.lazy, is what keeps it in a chunk of its own — the bundler
// splits it because nothing in the first download can reach it.
import { lazy } from 'react';

export const BucketBars = lazy(() => import('./bucket-bars'));
export const Sparkline = lazy(() => import('./sparkline'));
export type { Bucket } from './bucket-bars';
