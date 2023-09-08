audience: deployers
level: minor
reference: issue 5514
---
Adds support for postgres version 15.

Note: if you want to migrate your local dev db to pg15, you'll need to either erase the existing db with `docker volume rm taskcluster_db-data` before you migrate, or, if you'd prefer to keep your local dev data, you'll need to manually dump the db contents and then import them into the upgraded db.

Support for postgres v11 will be dropped from Taskcluster on November 9, 2023 (v11 EoL date) and that will be a breaking change.
