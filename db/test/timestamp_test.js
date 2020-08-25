const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const tcdb = require('taskcluster-db');

suite(testing.suiteName(), function() {
  const schema = tcdb.schema({ useDbDirectory: true });

  test('DB has no timezone-less timestamp columns', function() {
    /* Postgres TIMESTAMP columns, by default, lack a timezone.  While it's possible to
     * design a DB with the implicit assumption that all timestamps are in UTC, this is
     * a source of confusion and errors.  Instead, we require that every TIMESTAMP column
     * have a timezone.  The shorthand for this type is TIMESTAMPTZ, but it appears as
     * 'timestamp with time zone' in tables.yml. */
    for (const [tableName, table] of Object.entries(schema.tables.get())) {
      for (const [columnName, type] of Object.entries(table)) {
        assert(!/timestamp(?! with time zone)/.test(type),
          `${tableName}.${columnName} has a timestamp type without a timezone`);
      }
    }
  });
});
