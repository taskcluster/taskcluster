# Preparation

To prepare, you will want to familiarize yourself with:

 * Postgres in general
 * taskcluster-lib-postgres
 * The [azure-entities](https://github.com/taskcluster/azure-entities) API (how it's called from services, not its implementation)
 * taskcluster-lib-entities (how it's implemented, how it calls `db.fns.`, etc.)

# Guidelines

We generally want to migrate one table in each PR, to minimize overall
complexity.  In cases where tables are deeply intertwined, it's fine to do
several at once.

For each migration PR, there should be two steps: first the DB migration, and
then the service migration.  It's important that we be able to see the DB
migration tests pass (in CI or locally), as that represents the situation where old services are
still running in kubernetes after the DB has been upgraded.  This two-step
process allows us to use the service's unit tests to test the replacement DB
functions, rather than writing a whole suite of new tests that will just be
thrown out.

These steps are in the same DB version and the same PR, but should be in
distinct commits so they can be tested individually.

## DB Migration

In the DB migration step, the overall goal is to change the underlying DB
table from one built for Azure-Entities compatibility to a "normal" postgres
table with named, typed columns.  However, the implementation of the service
using that table does not change: it still uses taskcluster-lib-entities.  Running
the tests after this step, and before the next step, simulates the situation
after an operator runs `yarn db:upgrade` but before they have deployed new
versions of the service in kubernetes.

Here's a helpful checklist for this step (with more details below):

* Migration
  * [ ] Create a new DB version with a migration script to convert the `_entities` table into the new table.  [example](https://github.com/taskcluster/taskcluster/blob/9f2d526729ee191f3f7be077a689710478b8c040/db/versions/0009-migration.sql)
  * [ ] Update [`db/tables.yml`](https://github.com/taskcluster/taskcluster/blob/9f2d526729ee191f3f7be077a689710478b8c040/db/tables.yml#L90-L96) and [`db/access.yml`](https://github.com/taskcluster/taskcluster/blob/9f2d526729ee191f3f7be077a689710478b8c040/db/access.yml#L32) accordingly.
  * [ ] Add a DB version test that tests this upgrade. [example](https://github.com/taskcluster/taskcluster/blob/9f2d526729ee191f3f7be077a689710478b8c040/db/test/versions/0009_test.js#L28-L36)
* Downgrade
  * [ ] Write a downgrade script that reverses the effects of the upgrade. [example][https://github.com/taskcluster/taskcluster/blob/master/db/versions/0009-downgrade.sql)
  * [ ] Update the version tests to verify this as well. [example](https://github.com/taskcluster/taskcluster/blob/9f2d526729ee191f3f7be077a689710478b8c040/db/test/versions/0009_test.js#L38-L39)
* Replacement Entity Functions
  * [ ] Add new implementations of the `<tablename>_load`, `_create`, `_remove`, `_modify`, and `_scan` functions based on the new table. [example](https://github.com/taskcluster/taskcluster/blob/9f2d526729ee191f3f7be077a689710478b8c040/db/versions/0009.yml#L4-L214)
  * [ ] Run all of the service's tests and fix all the issues that come up.
  
### Migration

The migration script can use `->>` and `->` operators to extract most columns from
the `value` column in the old table.  But some columns are encoded by
taskcluster-lib-entities using a base64 encoding and properties with prefix
`__buf`.  The `entity_buf_decode` utility function (defined in version
0008) can help to decode these columns.  Retain the `etag` column in the new
table.  It is probably not useful in the new table, but is helpful on
downgrade.

You will want to lock the table during the migration to prevent concurrent
updates.

The test in `db/tests/upgrade_downgrade_test.js` test will identify issues with
`db/access.yml` and `db/tables.yml`.

In the version test at this point, just assert that the proper tables exist and don't
exist, implicitly asserting that the upgrade script doesn't crash. You'll
add more tests shortly.

### Downgrade

The downgrade script requires reconstructing the taskcluster-lib-entities
encodings, both of values (`entity_buf_encode`) and of keys
(`encode_string_key`).

Add code to the version test to ensure that the correct tables exist after
a downgrade, too.  At this point, it might be useful to add some temporary
data to the table to see the upgrades and downgrades modify it, but once
you have written the replacement entity functions, you can rely on
`helper.testEntityTable` to test the data integrity on upgrade / downgrade.

### Replacement Entity Functions

At this stage, the stored functions still refer to the old table.  In order to
support continued operation during the period between running the DB upgrade
and deploying the new version of the Taskcluster services, and to support
downgrades of the deployed services without rollback of the DB, we must supply
new versions of these functions that refer to the new table.

Here is where you will want to be familiar with how these functions are used
in taskcluster-lib-entities, as the semantics can be a bit funny.  Also,
consult the service to see which functions and which features of those
functions are required.

In the version test, include a copy of the `Entity` configuration from the
service's `data.js`, stripped of comments and older versions.  Use
`helper.testEntityTable` to easily test the version.

When running the service's unit tests, you will probably need to update the tests to clear out the new table instead of the old.  This is typically, but not always, a `resetTables` call in `test/helper.js`.
Try not to make any other changes to the service or its unit tests.
If you do change the tests, such as to add additional test cases or use encodable characters in strings, do so in a commit *before* this one, so that reviewers can double-check those changes work against the existing entities table.

## Service Migration

In the service migration step, the overall goal is to move away from using taskcluster-lib-entities and instead
communicate directly with the db via stored procedures. This will involve adding new db stored procedures and making
changes to the underlying service to use these new functions.

Here's a helpful checklist for this step (with more details below):
* DB Functions
	* [ ] Add new stored procedure functions. [example](https://github.com/taskcluster/taskcluster/blob/8d0600004fcaff7c1661e650bc48e424e7d409de/db/versions/0009.yml#L215-L288)
	* [ ] Add mock implementations for the functions in the relevant file under `db/src/fakes/`. [example](https://github.com/taskcluster/taskcluster/blob/8d0600004fcaff7c1661e650bc48e424e7d409de/db/src/fakes/purge_cache.js)
	* [ ] Create a file `db/test/fns/<service-name>_test.js` and write tests for these newly created functions. [example](https://github.com/taskcluster/taskcluster/pull/2748/commits/ae8654d3f2f85972a0a8fb11b6d9e9be8bcb83ef#diff-24717608297e5956dd619092dd4a135b)

* Service Modifications
	* [ ] Remove the table(s) being migrated from `main.js`. [example](https://github.com/taskcluster/taskcluster/pull/2716/commits/6727656e05d8204226705dea0777e30d3fd7dd68#diff-4870d07d27bcc1810fa17bd04ee9b80a)
	* [ ] Update the implementation of the service to use the stored procedure functions for the tables defined in the migration step. [example](https://github.com/taskcluster/taskcluster/pull/2716/commits/6727656e05d8204226705dea0777e30d3fd7dd68#diff-4870d07d27bcc1810fa17bd04ee9b80a)
	* [ ] Update the service's tests to stop using taskcluster-lib-entities for the table(s) being migrated. [example](https://github.com/taskcluster/taskcluster/pull/2716/commits/6727656e05d8204226705dea0777e30d3fd7dd68#diff-9c318c46f9b923b6018aa4c21a7b67fc)

### DB Functions

Here we'll want to come up with db functions that would later be used in the service directly rather than having them
interact with taskcluster-lib-entities. Experiment where to put logic (in API method or in DB).
For example, upserting in azure usually involves invoking a load then modify but in postgres,
this could easily be done using the `on conflict` clause making it a good choice to integrate the logic
in the db function.

Each stored procedure function should be tested thoroughly. DB data are at high stake.

### Service Modifications

In this last part of the migration we'll want to change the table(s) being migrated to stop using
taskcluster-lib-entities and instead communicate with the db directly via the new stored procedure
functions defined earlier.

If necessary, you might need to define a data class which you could refer to this
[example](https://github.com/taskcluster/taskcluster/pull/2748/commits/ae8654d3f2f85972a0a8fb11b6d9e9be8bcb83ef#diff-6f428cf68b99354b5770cfca1e00338c)
for inspiration.
This approach is useful in cases where the service passes Entity instances around between components, as instances of the new class can replace the Entity instances.
In services where all access occurs directly in the API methods, such as purge-cache, a data class may not be necessary.

For paginated endpoints, taskcluster-lib-api's `paginateResults` utility function should be used.

# General Advice

**See Prior Art**.  Look at some of the migrations that have already been done
for ideas and solutions to common problems.

**Minimize Moving Parts**.  It's tempting to be smarter about things, maybe
moving search conditions into the DB functions or de-normalizing values that
were in a single Azure table.  For example, Dustin was tempted to change the
array of previous_provider_id's into an object.  Don't do it!  File bugs for
this sort of thing (they'll make good contributor bugs too!), rather than
trying to mix them into this already-complex process.

**Only Implement What is Required**.  Many of the services do not use all of
the Azure-Entities features, so you can skip implementing them where
necessary.  For example, if a service never calls Entity.create(.., true) to
overwrite existing entities, then you don't need to implement that support in
`sometable_entities_create`.  Use `raise exception 'not implemented'` for
these cases in case you missed as spot where the functionality is used.

**Beware Encodings**.  String keys are stored by tc-lib-entities using a
urlencoding-like encoding.  In the DB Migration step, be careful to encode and
decode appropriately.  You can test this by changing the values used for
primary and row keys in the service tests to include encodable characters such
as `/` or `~`.  For example, replace a workerType `wt-1` in a service's tests
with `wt~1`.

**PartitionKey and RowKey**.  The tc-lib-azure library expects its partition
and row keys to be returned twice from `_scan` and `_load`: once as return
values (`partition_key` and `row_key`), and once as `value.PartitionKey` and `value.RowKey`.  In all cases,
these values are encoded (`encode_string_key`).

**Optimistic Concurrency**. The entities support uses etags to implement a kind of [optimistic concurrency control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control).
The process is to read a row from the DB, manipulate it in the service, and then write it back to the DB _if the etag column has not changed_.
If the etag has changed, then the row is re-read, the modification re-applied, and another write attempt performed.
With a Postgres table, this kind of concurrency is not required when updating a column wholesale (`UPDATE .. SET description = 'xyz'`), as that does not affect other columns.
But updating a value within a more complex column can be problematic.

[This article](https://www.2ndquadrant.com/en/blog/postgresql-anti-patterns-read-modify-write-cycles/) discusses some of the potential issues.
In such cases, the existing etag column allows implementation of the OCC approach.
See worker-manager's `workers` table for an example.

## Rebasing

As many people are writing versions, it's common to need to re-number a DB version.
There is a temporary script that can help:

```shell
node infrastructure/renumber-db-version.js <oldversion> <newversion>
```

## Postgres

Now's your chance to learn Postgres.  It's a quirky piece of software
implementing an extremely quirky language, but its implementation is solid and
its documentation is fantastic.  Part of the point of this effort is to get
used to Postgres, so it's worth taking the time to learn.  We are using
Postgres 11, but most search results will find results for 9.x, so click the
"11" at the top to get the docs for our version.

**Use `_in` Argument Names**.  Postgres is easily confused when input arguments, return values, and table columns have the same name.
Use an `_in` suffix on function parameters, and disambiguate table
columns as `<tablename>.<columnname>` and function return values as
`<functionname>.<columnname>`.

**Beware Backslashes**.  Some of the Postgres string-handling functions,
especially `encode`, `decode`, and `::bytea`, treat backslashes specially.  We
have isolated these into utility functions and tested them thoroughly.  If you
find a need for more utility functions, add them, but be careful to test lots
of cases, including backslashes.  In particular, note that there is an
"alternative" string-escaping syntax `E'..'` documented at
https://www.postgresql.org/docs/11/sql-syntax-lexical.html#SQL-SYNTAX-CONSTANTS.

**Avoid Selecting Star**.  Using `select * from`, from a table which may someday
grow additional columns, is likely to lead to unhappy surprises when data
types change.  Instead, list the columns explicitly.

**Use Timestamptz**.  The default `timestamp` column type does not have a
timezone, so it could mean anything!  Use `timestamptz` instead.  This is
enforced in CI.

**Transactions Aren't Magic**. Bookmark [this mind-blowing
page](https://www.postgresql.org/docs/11/transaction-iso.html), noting that
*read committed* is the default and what we use for all transactions.  That
means that even inside a transaction, two read operations may return different
data.  Where necessary, use locking primitives such as `select .. for update`
or `lock table` to prevent concurrent updates that might cause corruption.
For example, the Auth service's roles may need special attention in this
regard.

**Prefer JSONB over JSON**.  Use JSONB data types, and where possible use `jsonb_`
utility functions.  The
[docs](https://www.postgresql.org/docs/11/datatype-json.html) provide a good
description of the difference between the types.

**Always Use Objects for JSON data**.  The node-pg library has no context to
know the type of a function parameter.  It correctly assumes that a JS object
should be encoded with JSON, but given a string or an Array it will mis-encode
it and cause strange errors.  Try to avoid these cases, but if necessary, just
JSON-encode the value before passing it to `db.fns.<function>(..)`.  See
`previous_provider_ids` in worker-manager for an example.

**Utility Functions**.

* `{encode,decode}_string_key` encode and decode the urlencoding-like format
that taskcluster-lib-azure uses for partition and row keys.
* `{encode,decode}_composite_key` encode and decode CompositeKey values, where
two strings are combined into a single PartitionKey or RowKey.
* `entity_buf_{encode,decode}` encode and decocde the `__buf`+base64 encoding
taskcluster-lib-postgres uses to store binary values.
* `sha512(t)` computes the sha512 hash of a value
* `uuid_to_slugid(uuid)` and `slugid_to_uuid(slugid)` convert between a uuid
string and a slugid.  While some entities tables stored slugIds in UUID format,
we prefer to store them in their 22-character string format in new tables.

## Pagination

For paginated API calls, use the new `paginatedResults` function in
`taskcluster-lib-api`.  In the underlying DB function, use parameters
`page_size_in` and `page_size_offset`, and derive the limit and offset clauses
as

```sql
  limit get_page_limit(page_size_in)
  offset get_page_offset(page_offset_in);
```

Consistent use of these argument names will allow us to add more utility
functions later, for example to create an async iterator over a function's
results.

## Testing

This is going to seem like a lot of tests, both new tests to write and
existing tests to modify.  Sorry!  Unfortunately, this is high-stakes stuff,
so we need the tests.

For example, if we fail to test the downgrade support and need to roll back
for some reason, we may end up with a lot of data loss.  If we fail to test
the entities-compatibility functions in the "DB migration" step thoroughly,
then a service outage may occur while upgrading to the new version.  And if
corner cases for the DB functions are not carefully tested, we may cause data
loss when those cases occur in production.

We have taken a shortcut in avoiding the need to write new tests for the
entities-compatibility functions, relying instead on the service tests to
exercise those functions.  It's worth reviewing the service tests to ensure
they actually exercise all of the DB functionality.  For example, is the list
endpoint's pagination behavior tested?  Do the tests try to get a resource
that doesn't exist?

# Future Challenges

A few potential issues remain to be solved, by whichever lucky engineer
encounters them first:

 * encrypted entities properties
 * signed entities rows
 * novel entity property types (Text, SlugIdArray, etc.)
 * migration of huge tables without downtime (or do we just plan the downtime?)
 * more complex conditions in `_scan` functions

Feel free to discuss these with other team members to find a good solution.
