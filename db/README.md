# Taskcluster Database

This directory defines the Taskcluster database:

* `versions/` -- the migrations that create the most-recent database schema
* `test/` -- tests for the contents of this directory
* `src/` -- implementation of the JS interface to the DB

## Stored Procedures

<!-- SP BEGIN -->
### secrets

| Name | Mode | Args | Returns |
| --- | --- | --- | --- |
| get_secret | Symbol(read) | name text | table (secret text) |,| get_secret_with_expires | Symbol(read) | name text | table (secret text, expires timestamp) |,| list_secrets | Symbol(read) |  | table (name text) |,| list_secrets_with_expires | Symbol(read) |  | table (name text, expires timestamp) |,| remove_secret | Symbol(write) | name text | void |,| remove_secret | Symbol(write) | name text | void |,| set_secret | Symbol(write) | name text, secret text | void |,| set_secret_with_expires | Symbol(write) | name text, secret text, expires timestamp | void |
<!-- SP END -->

## Database Schema

TBD

### Versions

TBD

## JS Interface

The `taskcluster-db` package exports a `setup` function which is intended to be used in services' `main.js`:

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

### Testing

For testing purposes, this package provides a completely *fake* `db` instance, implemented entirely in JS.
This means that services can be tested without access to a postgres database.

The fake database is available via

```javascript
const tcdb = require('taskcluster-db');
const fakeDb = tcdb.fakeSetup({serviceName: 'queue'});
```

All of the `fakeDb.proc.<name>` methods to which the service has access are available.
Specific helper methods are available on sub-objects, such as `fakeDb.secrets.makeSecret`.
See the source code of this package for the specific helpers that are available.
