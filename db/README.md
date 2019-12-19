# Taskcluster Database

This directory defines the Taskcluster database:

* `versions/` -- the migrations that create the most-recent database schema
* `test/` -- tests for the contents of this directory
* `src/` -- implementation of the JS interface to the DB

## Stored Procedures

<!-- SP BEGIN -->
### secrets

| Name | Mode | Arguments | Returns | Description |
| --- | --- | --- | --- | --- |
| get_secret | read | name text | table (secret text) | Read the secret associated with some key. If the secret has recently expired, the response code 410 is returned.<br />If the caller lacks the scope necessary to get the secret, the call will fail with a 403 code regardless of<br />whether the secret exists. |
| get_secret_with_expires | read | name text | table (secret text, expires timestamp) | Read the secret associated with some key. If the secret has recently expired, the response code 410 is returned.<br />If the caller lacks the scope necessary to get the secret, the call will fail with a 403 code regardless of<br />whether the secret exists. |
| list_secrets | read |  | table (name text) | List the names of all secrets.<br />By default this end-point will try to return up to 1000 secret names in one request. But it may return less,<br />even if more tasks are available. It may also return a `continuationToken` even though there are no more results.<br />However, you can only be sure to have seen all results if you keep calling `listTaskGroup` with the last<br />`continuationToken` until you get a result without a `continuationToken`. If you are not interested in listing<br />all the members at once, you may use the query-string option `limit` to return fewer. |
| list_secrets_with_expires | read |  | table (name text, expires timestamp) | List the names of all secrets.<br />By default this end-point will try to return up to 1000 secret names in one request. But it may return less,<br />even if more tasks are available. It may also return a `continuationToken` even though there are no more results.<br />However, you can only be sure to have seen all results if you keep calling `listTaskGroup` with the last<br />`continuationToken` until you get a result without a `continuationToken`. If you are not interested in listing<br />all the members at once, you may use the query-string option `limit` to return fewer. |
| remove_secret | write | name text | void | Delete the secret associated with some key. |
| remove_secret | write | name text | void | Delete the secret associated with some key. |
| set_secret | write | name text, secret text | void | Set the secret associated with some key. If the secret already exists, it is updated instead. |
| set_secret_with_expires | write | name text, secret text, expires timestamp | void | Set the secret associated with some key. If the secret already exists, it is updated instead. |
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

### Testing Support

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

## Development

To test this library, you will need a Postgres database, running the latest release of Postgres 11.
The easiest and best way to do this is to use docker:

```shell
docker run -ti -p 5432:5432  --rm postgres:11
```

This will run Docker in the foreground in that terminal (so you'll need to use another terminal for your work, or add the `-d` flag to daemonize the container) and make that available on TCP port 5432, the "normal" postgres port.
An advantage of running in the foreground is that Postgres helpfully logs every query that it runs, which can help with debugging and testing.

*NOTE* the test siute repeatedly drops the `public` schema and re-creates it, effectively deleting all data in the database.
Do not run these tests against a database instance that contains any useful data!

Once this container is running, set TEST_DB_URL to point to the database, as defined by [node-postgres](https://node-postgres.com/features/connecting).
For the docker container described above, use

```shell
export TEST_DB_URL=postgresql://postgres@localhost/postgres
```
