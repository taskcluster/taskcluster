# Entities Library

This library emulates [azure-entities](https://github.com/taskcluster/azure-entities/) but with a postgres backend.
This library sits on top of
[tascluster-lib-postgres](https://github.com/taskcluster/taskcluster/tree/master/libraries/postgres) and its purpose
is to facilitate the migration of our data from Azure to Postgres. Once the data has been migrated,
the plan is to eventually stop using and archive this library.
