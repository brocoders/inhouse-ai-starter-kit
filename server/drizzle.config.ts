// drizzle-kit reads this to turn `server/src/db/schema.ts` into SQL files under
// `server/drizzle/`. It never connects to a database: migrations are generated
// from the schema and applied by the app.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/src/db/schema.ts',
  out: './server/drizzle',
  strict: true,
  verbose: true,
});
