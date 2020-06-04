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
});
```

The read and write URLs typically come from serivce configuration.
The read URL is used for queries that only read data, and can operate on read-only server mirrors, while queries that will modify the content of the database use the write URL.
The `monitor` is a taskcluster-lib-monitor instance, used to report database metrics.
if `statementTimeout` is set, then it is treated as a timeout (in milliseconds) after which a statement will be aborted.
This is typically used in web processes to abort statements running longer than 30s, after which time the HTTP client has likely given up.

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

### Secret Data

Some data in the database is secret and must be encrypted at rest, and in transit to and from the server.
To accomplish this, secret data is encapsulated in a "crypto container", and this library supplies functions to construct and parse that container.
The container embeds a key identifier, allowing smooth rotation of encryption keys by defining a new key in the service deployment and eventually re-encrypting all values in the table to use that new key.
During the re-encryption process, any queries against the table will select the appropriate key based on the key identifier, ensuring continued operation.

The library provides functionality for automatically re-encrypting all rows in a table in a periodic task.
The process of rotating encryption keys involves adding a new key to the deployment configuration, waiting until all such periodic tasks have run successfully, and then removing the old key from the configuration.

XXX document that in the deployment docs

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
# from the previous version.  This should also adjust any permisisons using
# `grant` and `revoke`.  The username prefix will be substituted for
# `$db_user_prefix$`, so such statements can take the form `grant .. to
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

# Similar to migrationScript, but reversing its effects.  It's OK for this to lose data.
# This can similarly specify a filename.  This is only required if migrationScript is
# present.
downgradeScript: |-
  begin
    revoke ...;
    alter ...;
    create ...;
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

To enable encryption/decryption, provide `Database.setup` with at least one of `azureCrytoKey` or `cryptoKeys`. The first
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

The format of the cleartext depends on context -- this library provides the caller with a JS Buffer object.
In general, this contains either a raw UTF-8 string or a JSON-encoded value.

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
The easiest and best way to do this is to use docker:

```shell
docker run -ti -p 127.0.0.1:5432:5432  --rm postgres:11
```

This will run Docker in the foreground in that terminal (so you'll need to use another terminal for your work, or add the `-d` flag to daemonize the container) and make that available on TCP port 5432, the "normal" Postgres port.

*NOTE* the test suite repeatedly drops the `public` schema and re-creates it, effectively deleting all data in the database.
Do not run these tests against a database instance that contains any useful data!

Once this container is running, set TEST_DB_URL to point to the database, as defined by [node-postgres](https://node-postgres.com/features/connecting).
For the docker container described above, use

```shell
export TEST_DB_URL=postgresql://postgres@localhost/postgres
```

It can be helpful to log all queries run by the test suite:

```shell
docker run -ti -p 127.0.0.1:5432:5432  --rm postgres:11 -c log_statement=all
```
