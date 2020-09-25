# DB 

The Taskcluster DB is implemented in the `db/` directory of this repository.
When we have a good reason to not follow the best practices in the db, we document why.

## Postgres

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

* `entity_buf_{encode,decode}` encode and decocde the `__buf`+base64 encoding
taskcluster-lib-postgres uses to store binary values.
* `sha512(t)` computes the sha512 hash of a value
* `uuid_to_slugid(uuid)` and `slugid_to_uuid(slugid)` convert between a uuid
string and a slugid.  While some entities tables stored slugIds in UUID format,
we prefer to store them in their 22-character string format in new tables.

## Redefining DB Functions 

To redefine a DB function, append `_{2, N}` to the method. For example, redefining `get_widgets` will involve creating
`get_widgets_2`. Note that sometimes it's ok to rename the function instead of appending `_{2, N}`.
Use your own discretion.

## Pagination

See the [pagination section](https://github.com/taskcluster/taskcluster/tree/main/libraries/postgres#pagination)
in taskcluster-lib-postgres.

## Testing

This is going to seem like a lot of tests, both new tests to write and
existing tests to modify. Sorry! Unfortunately, this is high-stakes stuff,
so we need the tests.

For example, if we fail to test the downgrade support and need to roll back
for some reason, we may end up with a lot of data loss.  If we fail to test
the entities-compatibility functions in the "DB migration" step thoroughly,
then a service outage may occur while upgrading to the new version.  And if
corner cases for the DB functions are not carefully tested, we may cause data
loss when those cases occur in production.

## Rebasing

As many people are writing versions, it's common to need to re-number a DB version. There is a temporary script that can help:

```shell
node infrastructure/renumber-db-version.js <oldversion> <newversion>
```

---

Did you find a place in the DB where some of the guidelines are not followed?
[File an issue](https://github.com/taskcluster/taskcluster/issues/new/).
Bonus points for sending a pull-request to close the issue :-)
