// `pnpm test:postgres` is the run that proves the app on real PostgreSQL. With
// no TEST_DATABASE_URL the settings quietly fall back to PGlite, so the run
// would pass while testing nothing it promised to. Stop before it starts.
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    'test:postgres needs a database to run against. Set TEST_DATABASE_URL, e.g.\n\n' +
      '  TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/inhouse_test pnpm test:postgres\n\n' +
      'Everything in that database is dropped and rebuilt, so never point it at one you care about.',
  );
  process.exit(1);
}
