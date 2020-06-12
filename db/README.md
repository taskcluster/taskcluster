# Taskcluster Database

This directory defines the Taskcluster database:

* [Stored Functions](./fns.md) -- list of stored functions defined by this package
* [`versions/`](./versions) -- the migrations that create the most-recent database schema
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
* [ ] any necessary updates in `db/tables.yml` and `db/access.yml`
* [ ] new test script in `db/test/versions`
  * [ ] test forward migration
  * [ ] test downgrade
  * [ ] test migration after downgrade (ensuring downgrade doesn't leave stray Postgres resources around)
* for any *new* stored functions:
  * [ ] fake implementation in `db/src/fakes/<serviceName>.js`
  * [ ] tests for new functions in `db/test/fns`

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

Tests typically take the form

```js
  test('...', async function() {
    await helper.upgradeTo(16); // upgrade to the previous version

    // insert some data
    await helper.withDbClient(async client => {
     ..
    });

    await helper.upgradeTo(17); // upgrade to this version

    // assert that things were migrated properly
    await helper.withDbClient(async client => {
     ..
    });
  });
```

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

### Testing Support

For testing purposes, this package provides a completely *fake* `db` instance, implemented entirely in JS.
This means that services can be tested without access to a postgres database.

The fake database is available via

```javascript
const tcdb = require('taskcluster-db');
const fakeDb = tcdb.fakeSetup({serviceName: 'queue'});
```

All of the `fakeDb.fns.<name>` methods to which the service has access are available.
Specific helper methods are available on sub-objects, such as `fakeDb.secrets.makeSecret`.
See the source code of this package for the specific helpers that are available.

## Development

To test this library, you will need a Postgres database, running the latest release of Postgres 11.
The easiest and best way to do this is to use docker, as described in the [Development Process docs](../dev-docs/development-process.md).
