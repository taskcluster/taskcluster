# Taskcluster Database

This directory defines the Taskcluster database:

* [Stored Functions](./fns.md) -- list of stored functions defined by this package
* [`versions/`](./versions) -- the migrations that create the most-recent database schema
  * [`schema.md`](./schema.md) -- tables and indexes in the DB (for internal use only!)
  * [`tables.yml`](./tables.yml) -- tables in the DB (for internal use only!)
  * [`access.yml`](./access.yml) -- definitions for which services can access which tables
* [`test/`](./test) -- tests for the contents of this directory
* [`src/`](./src) -- implementation of the JS interface to the DB

## Database Schema

The database schema is handled by [taskcluster-lib-postgres](../libraries/postgres).
Each database version is defined in `db/versions/####.yml`, numbered sequentially, as decribed in that library's documentation.

### Changing the Database

It's not permitted to change an existing version file (`db/versions/*.yml`) [*].
Instead, any change to the DB must be made by adding a new version.
This allows deployments of Taskcluster to follow those changes smoothly.

> [*] There are a few exceptions: fixing bugs in a version that has not yet been included in a Taskcluster release, and updating stored-function descriptions.

A version file has a `migrationScript` which performs the change to the database.
This can use any Postgres functionality required to make the change.
In some cases, that's as simple as `CREATE TABLE` or `ALTER TABLE`, but can also involve temporary tables and complex data manipulation.
The script runs in a single transaction.

#### Checklist

The following checklist summarizes what needs to be written to modify the database.

* [ ] new version file in `db/versions` that updates all impacted stored functions
  * All DB functions must continue to function for two major Taskcluster versions after they are used.  See [db/fns.md](fns.md) to figure out which existing functions you must re-implement.
  * For any DB functions that are being deprecated in this version, re-implement it such that it will continue working after the migration, and add `deprecated: true` in the re-implementation of that function.
  * The migration script itself must complete quickly; slower changes must be deferred to online migrations / downgrades, and may require several database versions to complete
* [ ] any necessary updates in `db/access.yml`
* [ ] new test script in `db/test/versions` using `dbVersionTest`
* [ ] tests in `db/test/fns` for any *new* stored functions (or for regressions in existing functions):

Note that deprecated DB functions *must* continue to work in order to meet Taskcluster's compatibility guarantees.
A function that crashes after the migration due to a missing table or missing column and cause user-visible failures violates that guarantee.
"Continue to work" may mean doing nothing or returning nothing, as long as the result for the user is sensible.
In cases where the existing function does not need to be revised (for example, a `get_` function in a migration that adds a column), the method's `body`, `args`, etc. properties can be omitted in the YAML file.

#### Migrations and Downgrades

Migration and downgrade scripts should mirror one another, so that running a downgrade after a migration produces an identical database.
This must always be true for the schema, and should be true for data where possible.
The exceptions for data are where the migration adds room for more data such as a new column or table: data in that column or table can be dropped on downgrade; and where the migration drops data: the downgrade cannot possibly recover that data.

Migration scripts must complete quickly, to avoid production downtime when they are applied.
In general, this means avoiding any operations that would perform a scan of a table while holding a lock, but some experimentation and a deep reading of Postgres documentation is useful to know for sure.

A common example of a "slow" migration is rewriting columns into a new format, such as combining `provisioner_id`/`worker_type` into `worker_pool_id`.
In this case, the rewriting must be done "online", and two database versions are required (one to add the new column, and one to remove the old).
See the taskcluster-lib-postgres documentation for details of how this works.
The following is an example of how this might be implemented for a hypothetical table with a primary key named `id`.
See the existing migration scripts (such as versions 59-60) for more examples.

```yaml
version: 50
description: Add and populate worker_stuff.worker_pool_id
migrationScript: |-
  begin
    alter table worker_stuff add column worker_pool_id text;

    create function online_migration_v50_batch(batch_size_in integer, state_in jsonb)
    returns table (count integer, state jsonb) as $$
    declare
      item record;
      count integer;
    begin
      count := 0;

      -- NOTE: a more advanced migration would use the primary key to start
      -- the search for nulls midway through the table, storing that in `state`
      -- see db/versions/0059-migration.sql#L13-32
      for item in
        select id
        from worker_stuff
        where worker_pool_id is null
        limit batch_size_in
      loop
        update worker_stuff
        set worker_pool_id = worker_stuff.provisioner_id || '/' || worker_stuff.worker_type
        where worker_stuff.id = item.id;
        count := count + 1;
      end loop;
      return query select
        count as count,
        '{}'::jsonb as state;
    end
    $$ language plpgsql;

    create function online_migration_v50_is_complete() returns boolean as $$
    begin
      perform * from worker_stuff where worker_pool_id is null limit 1;
      return not found;
    end
    $$ language plpgsql;
  end
downgradeScript: |-
  begin
    alter table worker_stuff drop column worker_pool_id;
  end
methods:
  create_worker_stuff:
    # update all methods that modify data to set the provisioner_id/worker_type
    # and worker_pool_id columns
    ..
  get_worker_stuff:
    # update all other methods that access data or use the affected columns
    # to ensure they maintain the expected functionality during online
    # migration and downgrade, accounting for both cases of having no
    # worker_pool_id column or having no provisioner_id and worker_type
    ..
```

On completion of the migration for version 50, the `worker_stuff` table has a
`worker_pool_id` column that matches `provisioner_id` and `worker_type`, and any
modifications to the database maintain this invariant.  The next step is to drop
the old columns, but on downgrade those old columns must be re-populated.

```yaml
version: 51
description: Drop worker_stuff.provisioner_id and worker_type
migrationScript: |-
  begin
    alter table worker_stuff drop column provisioner_id, drop column worker_type;
    -- see https://medium.com/doctolib/adding-a-not-null-constraint-on-pg-faster-with-minimal-locking-38b2c00c4d1c
    alter table worker_stuff add constraint worker_pool_id_not_null check (worker_pool_id is not null) not valid;
  end
downgradeScript: |-
  begin
    alter table worker_stuff drop constraint worker_pool_id_not_null;
    alter table worker_stuff add column provisioner_id text, add column worker_type text;

    create function online_downgrade_v50_batch(batch_size_in integer, state_in jsonb)
    returns table (count integer, state jsonb) as $$
    declare
      item record;
      count integer;
    begin
      count := 0;

      -- here, too, we could use `state` to find the id to start at
      for item in
        select id
        from worker_stuff
        where worker_type is null or provisioner_id is null
        limit batch_size_in
      loop
        update worker_stuff
        set
          provisioner_id = split_part(worker_stuff.worker_pool_id, '/', 1),
          worker_type = split_part(worker_stuff.worker_pool_id, '/', 2)
        where worker_stuff.id = item.id;
        count := count + 1;
      end loop;
      return query select
        count as count,
        '{}'::jsonb as state;
    end
    $$ language plpgsql;

    create function online_downgrade_v50_is_complete() returns boolean as $$
    begin
      perform * from worker_stuff where worker_type is null or provisioner_id is null limit 1;
      return not found;
    end
    $$ language plpgsql;
  end
methods:
  create_worker_stuff:
    # redefine functions to use only the worker_pool_id column, splitting it to get
    # provisioner_id and worker_type where necessary; and add additional functions that
    # take worker_pool_id as an argument or return worker_pool_id.
    ..
```

#### Permissions

This script should also update database permissions as necessary.
The username prefix is substituted for `$db_user_prefix$`, so permissions can be managed with statements like

```sql
grant select on table newtable to $db_user_prefix$_someservice;
```

As a safety check, the upgrade machinery will confirm after an upgrade is complete that the permissions in the database match those in `db/access.yml`.

#### Stored Functions

Each version file should redefine any stored functions that are affected by the schema changes, and define any newly-required functions.
Unchanged functions can be omitted.
A function's signature (argument and return types) cannot change from version to version.
Instead, define a new function with a different name.

For example, if `get_widget(widgetId text) returns table (widgetWidth integer)` must be extended to also return a widget height, define a new `get_widget_with_height` method.
This approach leaves the existing method in place so that older code can continue to use it.

When a method no longer makes sense (for example, when a feature is removed), redefine the method to return an empty table or default value, as appropriate.
For example, if support for widgets is removed, `get_widget` should be redefined to always return an empty table.

#### Migration Tests

Every version should have tests defined in `db/tests/versions/`.
These tests should exercise all of the functionality of the migration script, and verify that everything is as expected.
These tests should be very thorough, as broken migration scripts cannot be easily fixed once they are included in a Taskcluster release.
Ensure that they cover every conceivable circumstance, especially if they modify existing data.

The helper function `dbVersionTest` can help with testing migrations and downgrades, including online operations.
This function creates a suite of tests for various scenarios.
Its documentation is in comments in `db/test/helper.js`.
See versions 59-60 for an example.

Migrations that do not change the database schema do not need version tests, but must still include a test file with a comment explaining why.
If the migration defines or redefines any functions, then the function tests should be updated accordingly.
See version 51 for an example.

#### Function Tests

Tests for stored functions should be in `db/tests/fns/<service-name>_test.js`.
These tests serve as unit tests for the stored functions, and also help to ensure that modifications to the stored functions do not unexpectedly change their behavior.
In most cases, existing tests for a stored function should continue to pass without modification even when a new DB version modifies the function implementation.
There are exceptions to this rule, but reviewers should carefully scrutinize any such changes to ensure they will not break compatibility.

## JS Interface

The `taskcluster-db` package exports an async `setup` function which is intended to be used in services' `main.js`:

```javascript
const tcdb = require('taskcluster-db');
// ...
  db: {
    requires: ['cfg'],
    setup: ({cfg}) => tcdb.setup({
      readDbUrl: cfg.db.readDbUrl,
      writeDbUrl: cfg.db.writeDbUrl,
      serviceName: 'queue',
    }),
  }
```

The result is a taskcluster-lib-postgres Database instance all set up and ready to use.
This uses the generated schema by default.

Similarly, the `upgrade` method will upgrade a database to the current version and set up table permissions for per-service postgres users.
To upgrade to a specific version, pass `toVersion: <number>`.
This functionality is typically used in tests, as in production deployments the deployers will run `yarn db:upgrade`.

```javascript
const tcdb = require('taskcluster-db');

setup('upgrade db', async function() {
  await tcdb.upgrade({
    adminDbUrl: process.env.TEST_DB_URL,
    usernamePrefix: 'test',
  });
});
```

Finally, to get the current Schema instance, call `tcdb.schema({})`.

All of these functions take an optional `useDbDirectory: true` option to indicate that they should read from the YAML files under `db/` instead of using the serialized format.
This approach is slower, but is appropriate for testing.

## Development

To test this library, you will need a Postgres database, running the latest release of Postgres 11.
The easiest and best way to do this is to use docker, as described in the [Development Process docs](../dev-docs/development-process.md).
