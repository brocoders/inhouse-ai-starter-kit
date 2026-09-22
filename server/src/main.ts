// Start the app: settings, migrations, the background worker, then the port.
// Stopping is the same list backwards, and it waits — a release that killed a
// half-finished job would leave the work undone with nothing to say so.
import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { config } from './config.ts';
import { handle } from './db/index.ts';
import { migrateDb } from './db/migrate.ts';
import './jobs/definitions.ts';
import { startWorker, type Worker } from './jobs/worker.ts';
import { log } from './log.ts';

await migrateDb(handle);

let worker: Worker | undefined;
if (config.worker) worker = startWorker();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info(
    {
      port: info.port,
      database: handle.kind,
      worker: config.worker,
      timeZone: config.timeZone,
    },
    `${config.appName} is listening`,
  );
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'shutting down');
  server.close();
  // Stop taking new jobs and let the one in hand finish.
  await worker?.stop();
  await handle.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
