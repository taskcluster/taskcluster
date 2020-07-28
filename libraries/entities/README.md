# Entities Library

This library emulates [azure-entities](https://github.com/taskcluster/azure-entities/) but with a postgres backend.
This library sits on top of
[taskcluster-lib-postgres](../postgres) and its purpose
is to facilitate the migration of our data from Azure to Postgres. Once the data has been migrated,
the plan is to eventually stop using and archive this library.

## Functions Exposed by a Postgres Table

For the first stage of the transition from azure to postgres, tables that taskcluster-lib-entities understand all
end with `_entities` (e.g., `clients_entities`). For each of these tables, the database exposes 5 functions to the user.

### `<tableName>_load`

Load an entity. Throws a 404 error with code `ResourceNotFound` when not found.

### `<tableName>_create`

Create an entity. If the create operation is successful, the etag is returned in an object keyed
by the table name (e.g., `[{ <tableName>_create: <etag> }]`). The method will throw an error if the entity already exists
unless if `overwrite` is set to true in which case it will overwrite the existent entry.

### `<tableName>_remove`

Remove an entity. If the remove operation is successful, the etag is returned in a set. Else, no etag is returned.

### `<tableName>_modify`

Modify an entity. If the modify operation is successful, the etag is returned in a set.
Else, an error will be raised with the following error code:
* `P0004` - update was unsuccessful (e.g., the etag value did not match)
* `P0002` - entry not found in the table (i.e., no such row)

### `<tableName>_scan`

Scan a table for entries matching the partition key, row key and a condition. All of the arguments are optional.
The size and page could also be given to limit or offset the set of matches.
If no matches are found, an empty array is returned.
