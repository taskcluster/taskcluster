# Postgres Library

This library supports Taskcluster services using Postgres as a data-storage backend.

## Usage

There are two components to this library: a schema, and a database.
The schema represents the organization of the data in the database, and within this repository is defined by the `db/` directory.
This is constructed with:

```javascript
const {Schema, Database} = require('taskcluster-lib-postgres');
const schema = Schema.fromDbDirectory('../../../db');
```

With this in place, construct a database client with:

```javascript
const db = Database.setup({
  schema,
  writeDbUrl: ..,
  readDbUrl: ..,
});
```

The read and write URLs typically come from serivce configuration.
The read URL is used for queries that only read data, and can operate on read-only server mirrors, while queries that will modify the content of the database use the write URL.

Once that is finished, the methods defined in the schema can be called on the `db.procs` object.
For example, if the schema defines a `getWidgetsPerWorker` method:

```javascript
const wpw = await db.getWidgetsPerWorker();
```

Note that there direct SQL access to the database is *not allowed*.
All database operations must be made via `db.procs` calls which translate into invocations of Postgres stored procedures.
This is a critical feature of the library's compatibility strategy.

## Conceptual Overview

The library expects to define a single schema for all services hosted in this repository, and assumes that schema is applied to a dedicated Postgres database.

Each Taskcluster service has its own Postgres user that it uses for access to the database, and the library uses Postgres permissions to limit access to tables and columns to specific services.
This enforces isolation between microservices and prevents compromise of one service from spreading to other services.

Services interface with the database exclusively through stored procedures, which are defined as part of the schema.
Each procedure is assigned to a service by name, again enforcing some isolation between services.
It is permissible, in limited and well-considered circumstances, for a service to call read-only procedures that "belong" to another service.

Each procedure is also annotated as to whether it requires write access to the database, and the library automatically redirects read-only invocations to a different database connection.
Those deploying Taskcluster can configure this connection to address a read-only Postgres replica.

### Version Upgrades and Compatibility

The current "version" of the database is stored in the `tcversion` table.
This is a monotonically increasing integer, the value of which is independent of the Taskcluster release version.
Each new version comes with an upgrade script that runs in a transaction, thus either applying or failing as a single unit.

When deploying a new version of Taskcluster, any necessary database upgrades *must* be applied before any services are upgraded.
We maintain the invariant that services expecting database version S can interoperate with a database at version V as long as V >= S.

This invariant is maintained through careful attention to the definitions of the stored procedures.
These stored procedures are changed as necessary during the upgrade process, such that a procedure operates identically before and after the ugprade: identical arguments, identical return type, and correct behavior.
For example, if an upgrade factors a single table into two tables, then a procedure which previously queried from the single table would be rewritten during the ugprade to perform a join over the two new tables, returning appropriate results in the same format as before the upgrade.

A consequence of this design is that "procedures are forever" -- an upgrade can never delete a stored procedure.
At worst, when a feature is removed, a stored procedure can be rewritten to return an empty result or perform no action.

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
