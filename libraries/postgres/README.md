# Postgres Library

This library supports Taskcluster services using Postgres as a data-storage backend.

## Usage

There are two components to this library: a schema, and a database.
The schema represents the organization of the data in the database, including tables, stored functions, indexes, etc., as well as user permissions.
This is constructed with:

```javascript
const {Schema, Database} = require('taskcluster-lib-postgres');
const schema = Schema.fromDbDirectory('path/to/db/directory');
```

With this in place, construct a database client with:

```javascript
const db = Database.setup({
  schema,
  writeDbUrl: ..,
  readDbUrl: ..,
  serviceName: ...,
  monitor: ...,
  statementTimeout: ..., // optional
  poolSize: ..., // optional, default 5
  azureCryptoKey: ..., // optional, for backward compatibility
  dbCryptoKeys: ..., // optional, only required if encrypting columns, usually from cfg.postgres.dbCryptoKeys
});
```

The read and write URLs typically come from serivce configuration.
The read URL is used for queries that only read data, and can operate on read-only server mirrors, while queries that will modify the content of the database use the write URL.
The `monitor` is a taskcluster-lib-monitor instance, used to report database metrics.
if `statementTimeout` is set, then it is treated as a timeout (in milliseconds) after which a statement will be aborted.
This is typically used in web processes to abort statements running longer than 30s, after which time the HTTP client has likely given up.

The `azureCryptoKey`, and `dbCryptoKeys` parameters are explained below in "Secret Data" and "Encryption".

The `poolSize` parameter specifies the maximum number of Postgres clients in each pool of clients, with two pools (read and write) in use.
DB function calls made when there are no clients available will be queued and wait until a client is avaliable.

Once that is finished, the methods defined in the schema can be called on the `db.fns` object.
For example, if the schema defines a `getWidgetsPerWorker` method:

```javascript
const wpw = await db.fns.getWidgetsPerWorker();
```

Note that direct SQL access to the database is *not allowed*.
All database operations must be made via `db.fns` calls which translate into invocations of Postgres stored functions.
This is a critical feature of the library's compatibility strategy.
See "Version Upgrades and Compatibility", below.

### Schema

Schema objects are constructed either from the DB directory format described below or, for efficiency, from a format suitable for JSON serialization.
Do not call the Schema constructor.
Insead, construct objects with either of

```javascript
const schema1 = Schema.fromDbDirectory('path/to/db/directory');
const schema2 = Schema.fromSerializable(serializableData);
```

In general, prefer the first form in tests, so that changes to the DB directory can be tested quickly, and the second for in production.
A serializable representation of a schema is available from `schema.asSerializable()`.

The schema's `allMethods` method returns all methods defined in the schema, including deprecated methods.

## Conceptual Overview

The library expects to define a single schema for all services hosted in this repository, and assumes that schema is applied to a dedicated Postgres database.

Each Taskcluster service has its own Postgres user that it uses for access to the database, and the library uses Postgres permissions to limit access to tables and columns to specific services.
This enforces isolation between microservices and prevents compromise of one service from spreading to other services.

Services interface with the database exclusively through stored functions, which are defined as part of the schema.
Each function is assigned to a service by name, again enforcing some isolation between services.
It is permissible, in limited and well-considered circumstances, for a service to call read-only functions that "belong" to another service.
This is enforced both at the JS level (read-write functions for other services are not even available) and at the Postgres permission level (services do not even have read access to tables that are not specifically whitelisted).

Each function is also annotated as to whether it requires write access to the database, and the library automatically redirects read-only invocations to a different database connection.
Those deploying Taskcluster can configure this connection to address a read-only Postgres replica.

### Version Upgrades and Compatibility

The current "version" of the database is stored in the `tcversion` table.
This is a monotonically increasing integer, the value of which is independent of the Taskcluster release version.
Each new version comes with an upgrade script that runs in a transaction, thus either applying or failing as a single unit.

When deploying a new version of Taskcluster, any necessary database upgrades *must* be applied before any services are upgraded.
We maintain the invariant that services expecting database version S can interoperate with a database at version V as long as V >= S.

To allow an end to support for DB methods, it is allowed to completely drop support for database functions after *two* major Taskcluster revisions.
This is possible because deployers are required to update only a single major version at a time.
So, for example, services at version v25.1.2 will never run against a database defined in version v27.0.0, so that database version may drop support for functions that were never used in v26.x.x.

This invariant is maintained through careful attention to the definitions of the stored functions.
These stored functions are changed as necessary during the upgrade process, such that a function operates identically before and after the ugprade: identical arguments, identical return type, and correct behavior.
For example, if an upgrade factors a single table into two tables, then a function which previously queried from the single table would be rewritten during the ugprade to perform a join over the two new tables, returning appropriate results in the same format as before the upgrade.

A consequence of this design is that "functions are forever" -- an upgrade can never delete a stored function.
At worst, when a feature is removed, a stored function can be rewritten to return an empty result or perform no action.

#### Downgrades

It is sometimes necessary to roll back a deployment of Taskcluster services, due to an unexpected issue.
In most cases, the database compatibility model means that this can be done without changing the database itself: by design, old code can run against the new database.
However, if the issue is with the database itself, then the version upgrade must be rolled back.

This library supports *downgrades* for this purpose, reversing the effects of an upgrade.
A downgrade entails running the downgrade script for the buggy DB version, *after* downgrading the Taskcluster services to an older version.

Downgrades should not be done lightly, as they can lose data.
For example, downgrading a version that adds a table entails dropping that table and all data it contains.

#### Quick Migrations

Migration scripts should run quickly, even when tables have large row counts, to avoid downtime caused by locks.
"Quickly" is ambiguous.
Any operation which is independent of the table size certainly qualifies as "quick".
For example, adding a new, nullable column does not require rewriting all rows, although adding a non-null column with a default value does perform a full table scan and is not quick.
Deciphering what postgres operations are "quick" is difficult and requires testing and some careful reading of documentation.

Full scans of tables which are likely to be small are also "quick".
For example, the `roles` table in a typical deployment should number in thousands of rows, and postgres can scan such a table in millisecods.

#### Online Migrations

In cases where the changes to be made are not quick, this library supports "online migrations".
These follow a migration script and occur in a series of short transactions that run concurrently with production usage, without blocking that usage or causing inconsistencies.

For example, assume two columns (`old1` and `old2`) in a large table are to be merged into one (`new`).
The migration script creates the `new` column with a null value (a quick operation) and redefines the database-access functions to read from `new` if it is not null, otherwise `old1`/`old2`, and to write to all three columns.
Then the online migration, working in small batches, updates `new` in each row based on the `old1`/`old2` values.
Once all values of `new` are non-null, the online migration is complete.
A subsequent database version can then safely redefine the functions to use only the `new` column and drop the `old1`/`old2` columns.

### Secret Data

Some data in the database is secret and must be encrypted at rest, and in transit to and from the server.
To accomplish this, secret data is encapsulated in a "crypto container", and this library supplies functions to construct and parse that container.
The container embeds a key identifier, allowing smooth rotation of encryption keys by defining a new key in the service deployment and eventually re-encrypting all values in the table to use that new key.
During the re-encryption process, any queries against the table will select the appropriate key based on the key identifier, ensuring continued operation.

The library provides functionality for automatically re-encrypting all rows in a table in a periodic task.
The process of rotating encryption keys involves adding a new key to the deployment configuration, waiting until all such periodic tasks have run successfully, and then removing the old key from the configuration.

## DB Directory Format

The directory passed to `Schema.fromDbDirectory` should have the following format:

* `versions/####.yml` - one file for each DB version, starting at 1
* `access.yml` - per-service access permissions
* `tables.yml` - summary of table structure at the latest version

### Version Files

Each version file contains the information necessary to upgrade the database from the previous version.
Version 0 is implicitly an empty database with only the admin and per-service users created.

A version file contains the following:

```yaml
# the version number; this must match the filename
version: 17

# an SQL script, bracketed with `begin` and `end`, that will upgrade the database
# from the previous version.  The username prefix will be substituted for
# `$db_user_prefix$`, so such grants/revokes can take the form `grant .. to
# $db_user_prefix$_worker_manager`.  The script can be included inline in the YAML
# using `|-`, or specify a filename to load the script from an external file in the
# same directory.  In cases where no migration is required (such as adding or modifying
# stored functions), this property can be omitted.
migrationScript: |-
  begin
    create ...;
    alter ...;
    grant ...;
  end

# Similar to migrationScript, but reversing its effects. This can similarly
# specify a filename.  This is only required if migrationScript is present.
downgradeScript: |-
  begin
    revoke ...;
    alter ...;
    drop ...;
  end

# Methods for database access.  Each entry either defines a new stored function, or
# redefines an existing function (without changing argument or return types).
methods:
  method_name:  # name for the stored function and the corresponding JS method
    # Description of the stored function, for inclusion in `db/README.md`
    description: |-
      ...

    # Database access mode: read or write
    mode: read

    # The Taskcluster service that uses this method.  Services have access to all
    # methods tagged with their serviceName, and to read-only methods from other
    # services.
    serviceName: worker-manager

    # The stored function's arguments and return type.  These are substituted into
    # `CREATE FUNCTION <method_name>(<args>) RETURNS <returns>`.
    args: thing_id text
    returns: table (thing_property text)

    # If true, this method won't be available to be called at Database.funcs.  It will
    # still exist in the database!  Defaults to false, so this is omitted unless needed.
    # All other method fields can be omitted when this is true, thus supporting
    # deprecating a method without changing it.
    # When a method is deprecated, it is no longer available in `db.fns` but is made
    # available in `db.deprecatedFns` for use in testing but this method should no
    # longer be used in production.  The function is listed in `db/fns.md` a deprecated
    # including the TC versions through which it must be supported.
    deprecated: true

    # The body of the stored function.  This is passed verbatim to `CREATE FUNCTION`.
    # Like migrationScript, this can also be a filename to load the script from an
    # external file
    body: my-method.sql
```

### Access File

Because securing access to data in the DB is critical to Taskcluster's integrity, this library performs a check of access permissions after upgrades are complete.
This check is based on `access.yml`, which has the following format:

```yaml
service_name:
  tables:
    table_name: 'read' or 'write'
```

Each service which accesses the database is listed in this file, with the tables to which it has access.
Read access is translated to SELECT, while write access is translated to SELECT, INSERT, UPDATE, DELETE.

This file provides a simple, verified confirmation of which services have what access, providing a useful aid in reviewing changes as well as verification that no malicious or accidental access changes have been made in a production deployment.

### Tables File

The [tables file](../../db/tables.yml) serves as developer-oriented documentation of the tables available and their columns.
This helps developers understand the database structure without poring though version files to find all of the relevant `ALTER TABLE` statements.
It is verified to match the running database when a database upgrade is complete.

**NOTE**: the tables file *does not* define a public API for the Taskcluster service.
It is a form of developer documentation only.

The structure is:
```
table_name:
  column_name: column_type
  ...
```

Column types are a "stripped down" version of the full Postgres type definition, including only a simple type name and if necessary the suffix `not null`.
Primary keys, constraints, defaults, sequences, and so on are not included.

## Migrations

Each version specifies how to migrate from the previous version, and how to downgrade back to that version.
These are specified in `migrationScript` and `downgradeScript` as described in the "Version Files" section above.

Each is run in a single transaction, in which the versions's updated stored functions are also defined.

The `migrationScript` should perform all of the required schema changes, including adjusting permissions using `grant` and `revoke`. 
All operations in the migration script should be "quick" as defined above: no table scans, no locks held for a long time.
Note that Postgres locks are held until the end of the transaction, so it is wise to split up a migration that locks many tables into a sequence of independent versions.

The `downgradeScript` reverses the actions of the migration script.
Where possible, it must preserve data, but in many cases this is not possible due to the nature of the migration.
For example, if the migration script added a new table to store new data, that data is simply lost when the table is dropped.

### Online Migrations

An online migration occurs after a regular migration script completes successfully, as an "extension" of the migration script.
Similarly, an online downgrade acts as an extension of the downgrade script.
Versions with no online migration defined implicitly do nothing.

An online migration is defined by functions `online_migration_v<version>_batch` and `online_migration_v<version>_is_complete`, where `<version>` is the db version number without 0-padding.
These functions are defined in the migration script and dropped automatically after the online migration completes successfully.

The functions should have the following signatures:
```sql
create function online_migration_vNNN_batch(batch_size_in integer, state_in jsonb)
returns table (count integer, state jsonb)
as .. ;
create function online_migration_vNNN_is_complete() returns boolean
as .. ;
```

The `_batch` function will be called repeatedly with a requested batch size, and should attempt to perform that many modifications.
The caller may change the `batch_size_in` from call to call to achieve a target transaction time.
The `state_in` and `state` parameters allow state to be passed from one invocation to the next, beginning as an empty object.
A common approach is to store the latest-seen value of an indexed column in `state` and use that to avoid scanning already-migrated rows on the next invocation.
The function should return, in `count`, the number of modifications made.
A count of zero indicates that the online migration may be finished, and the caller will call the `_is_complete` function to check.
If not, it will start over with an empty state.

The `_is_complete` function should verify that the migration is complete, often via a table scan.
It is only called as necessary.

An online downgrade is defined by functions `online_downgrade_v<version>_batch` and `online_downgrade_v<version>_is_complete`.
These functions are created in the downgrade script, with the version number of that script, and they are dropped automatically after the online downgrade completes successfully.
They have identical signatures and calling process to the online migration functions, and the version number has to match that of the previous version (the target version of the downgrade).
It's not required that an online downgrade be defined to reverse every online migration.

Online migrations must be complete before the next version's migration begins.
The `upgrade` function will always try to complete the previous version's migration, allowing online migrations to be interrupted and restarted as necessary.
An online migration may also be interrupted and replaced with an online downgrade.

## Pagination

Pagination is the process of returning only some of the rows from a query, with a mechanism for getting the next "page" of rows in a subsequent query.
The [taskcluster-lib-api function `paginateResults`](./api#pagination) is useful for translating such paginated results into an API response (and supports both types of pagination).

### Index-Based

The preferred mechanism for paginating database queries is to pass `page_size_in` giving the number of rows in a page, and one or more `after_.._in` parameters specifying where the page begins.
The `after_.._in` parameters must correspond to an index on the table, so that Postgres can use that index to find the next row without a full scan.

For other uses in Taskcluster services, this library provides `paginatedIterator` to convert paginated results into an async iterator.

```javascript
const {paginatedIterator} = require('taskcluster-lib-postgres');

const doTheThings = async () => {
  for await (let row of paginatedIterator({
    indexColumns: ['foo_id', 'bar_id'],
    fetch: async (page_size_in, after) => db.fns.get_widgets({
      ...,
      page_size_in,
      ...after,
    }),
    size: 1000, // optional, defaults to 1000
  })) {
    // ..do something with `row`
  }
}
```

### Offset / Limit-Based

Many database functions which return many rows have `page_size int, page_offset int` as their last two arguments, and return a page of the given size at the given offset.
This is the "old way", and is not preferred both because it is not performant (the database must scan `page_offset` rows before it can return anything) and because it tends to result in missing or duplicate rows if insertions or deletions occur on the table.

The `paginatedIterator` also works for this type of pagination:

```javascript
const {paginatedIterator} = require('taskcluster-lib-postgres');

const doTheThings = async () => {
  for await (let row of paginatedIterator({
    fetch: async (size, offset) => db.fns.get_widgets(..., size, offset),
    size: 1000, // optional, defaults to 1000
  })) {
    // ..do something with `row`
  }
}
```

It's important to remember that each paginated fetch is a different transaction, and so the content of the DB may change from call to call.
An "offset" into a set of results that is rapidly changing size is not accurate, and can easily return the same row twice or skip a row.
For UI purposes, this is not a big deal, but may cause issues for other uses.
Use index-based pagination in such cases.

## Encryption

As described above, secret data is stored in a "crypto container".
The container is a JSONB column containing properties `kid` and `v` denoting the key-id and version.
The `kid` column identifies the key used to encrypt the data.
The `v` column identifies the format version.
All other properties are specific to the format version.

The library can read all versions, but all write operations use the current version.
It can also use multiple keys for decryption, but always uses a designated current key for encryption.
The versions are described below.

Migration scripts run server-side, and thus treat crypto containers as opaque data.
The exception to this rule is in migrating taskcluster-lib-entities tables to "normal" database tables, in which case the migration script assembles a version-0 container with a key ID of `azure` based on the entity value. For this translation, also make the `property` name that used to be used for the taskcluster-lib-entities values to be `val` i.e. `\_\_bufchunks\_val` and `\_\_buf0\_val`.

### Encryption and Decryption API

The `db.encrypt` and `db.decrypt` methods serve to encrypt and decrypt values for communication with the database server.
Both take a parameter named `value` that will either be encrypted and built into a format suitable for storing in the db
or pulled out of that format and decryped.

To enable encryption/decryption, provide `Database.setup` with at least one of `azureCryptoKey` or `dbCryptoKeys`. The first
of which is the key that `lib-entities` used for encryption. The latter is structured like

```javascript
[
  {
    id: '...', // This will be stored with any encrypted values and used to decide what key to decrypt it with later
    algo: 'aes-256', // Currently this is the only supported algo
    key: '...', // For aes-256, this must be 32 bytes in base64
  },
],
```

The last entry in that list will become the "current" encryption key and be used for all encryption. The other keys
should be kept around to allow decrypting older values. This allows for key rotation support. Once all old values have been
re-encrypted (see Updating Tables With New Keys below), these old keys can be removed from configuration.

Once the database has been set up, encryption and decryption can be used as follows

```javascript
await db.fns.create_widget(widgetId, db.encrypt({value: Buffer.from(widgetCode, 'utf8')}));

const rows = db.fns.get_widget(widgetId);
console.log(db.decrypt({value: rows[0].widget_code}).toString('utf8'));
```

The format of the cleartext depends on context -- this library provides the caller with a JS Buffer object.
In general, this contains either a raw UTF-8 string or a JSON-encoded value.

### Updating Tables With New Keys

Every service with encrypted data should have a periodic task that updates all rows of the table to use the current key and version.
In many cases, this can be combined with an expiration task.
The current version is available in the `CRYPTO_VERSION` constant of this library, and can be passed to an DB function to select rows that need to be updated (`.. where (secret_column -> 'v')::integer != $1 or secret_column -> 'kid' != $2 ..` with parameters `CRYPTO_VERSION` and the current key identifier).
For any matching rows, the task should simply pass the secret value through `decryptColumn` and `encryptColumn` to generate an up-to-date value for the crypto container.

### Container Version 0

Version 0 corresponds to the encryption format supported by [azure-entities](https://github.com/taskcluster/azure-entities).
The properties are defined in the [`BaseBufferType` constructor](https://github.com/taskcluster/azure-entities/blob/c6f63e3553c71f0859a5d6338ce5e7c7eb8c9671/src/entitytypes.js#L496-L508):  `__bufchunks_val` and `__bufN_val` for N = 0 to `__bufchunks_val`.
The binary payload is derived by first base64-decoding each `__bufN_val` property and then concatenating them in order.

That binary payload, in turn, is defined in the [`EncryptedBaseType` constructor](https://github.com/taskcluster/azure-entities/blob/c6f63e3553c71f0859a5d6338ce5e7c7eb8c9671/src/entitytypes.js#L716-L725).
It is the concatenation of a 128-bit (16-byte) random initialization vector (`iv`) and the ciphertext produced by aes-256 in CBC mode.

## Named Arguments with Stored Functions

This library supports calling stored functions with named arguments.
For this to work, a stored function should have all of its arguments end with "_in". For example, a db method with signature
`add_two_numbers(a_in int, b_in int)` can now be invoked with `db.fns.add_two_numbers({ a_in: 1, b_in: 2 })` in addition to `db.fns.add_two_numbers(1, 2)`.

## Security Invariants

Use of Postgres brings with it the risk of SQL injection vulnerabilities and other security flaws.
The invariants here *must* be adhered to avoid such flaws.

### All DB Access from Services Via Stored Functions

No service should *ever* execute a SQL query directly against the database.
All access should be performed via stored functions defined in a DB version file.
The code to invoke such stored functions is carefully vetted to avoid SQL injection, and all access should be channeled through that code.

This invariant also supports the compatibility guarantees described above.
It is enforced with a meta test, and PRs will fail if it is violated.

### No Admin Credentials in Services

The `adminUrl` configuration value should *never* be available to services.
It is only used in administrative contexts (hence the name).
As such, DB access made using administrative control can be less careful about SQL injection, since the inputs come from administrators and not API queries.

### Avoid Query Construction in Stored Functions

Calls from JS to Postgres aren't the only place where SQL injection might occur.
A stored function which uses string concatenation and `return query execute <something>` to generate a query can also be vulnerable.
Prefer to design around the need to do such query generation by creating multiple stored functions or limiting the types of arguments to non-textual types.

**NOTE** The taskcluster-lib-entities support is a notable exception to this rule, and is carefully vetted to avoid SQL injection through coordination of JS and SQL code.

### Encryption Key Protection

We wish to ensure that a compromise of the database server or the connection to that server does not disclose the cleartext content of encrypted columns.
To accomplish this, we never send encryption keys to the database server, whether for storage or for temporary use.
Only ciphertext is transmitted and stored.
All encryption and decryption occurs on the client.

Services do not share encryption keys.
While the database is configured to limit access for each service's DB user to only the necessary tables, as an additional protection services are unable to decrypt secret data belonging to another service.
For example, if the `taskcluster_worker_manager` user were accidentally granted read access to the auth service's `clients` table, it could only read the encrypted `access_token` column, and not decrypt it.
Because all configuration for a service is stored in memory, there is no additional security in using different encryption keys for different tables or columns within the same service.

## Error Constants

This module also defines a number of constants for Postgres's otherwise-cryptic SQLSTATE codes.
The symbol names and values are drawn from [PostgreSQL Error Codes](https://www.postgresql.org/docs/11/errcodes-appendix.html).
For example `tcLibPg.UNDEFINED_TABLE` is `"42P01"`.
Feel free to add any additional constants required in [`src/constants.js`](./src/constants.js).

The `ignorePgErrors` function can be useful to perform an operation and ignore some errors, mostly in tests:

```js
const {UNDEFINED, TABLE, ignorePgErrors} = require('taskcluster-lib-postgres');

# ...

await ignorePgErrors(someOperation(), UNDEFINED_TABLE);
```

Note that the return promise does not carry a value on success, as that success may have been due to an ignored error.

## Development

To test this library, you will need a Postgres database, running the latest release of Postgres 11.
The easiest and best way to do this is to use docker, as described in the [Development Process docs](../dev-docs/development-process.md).
