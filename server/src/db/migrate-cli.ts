// `pnpm db:migrate` — apply pending migrations and stop. The app does this for
// itself at startup too; this is for a release, where the database is brought
// up to date before the new version starts serving.
import { handle } from './index.ts';
import { migrateDb, schemaVersion } from './migrate.ts';

await migrateDb(handle);
const version = await schemaVersion(handle.db);
process.stdout.write(`Database is up to date: ${version} migration(s) applied.\n`);
await handle.close();
