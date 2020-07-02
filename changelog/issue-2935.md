audience: deployers
level: minor
reference: issue 2935
---
The `namespaces_entities` and `indexed_tasks_entities` tables have now been
migrated to use relational tables. For deployments with many (millions) of
tasks, this migration will take too long to perform online, and should be performed in a scheduled downtime.  Note that the ["service migration"](https://github.com/taskcluster/taskcluster/blob/master/dev-docs/postgres-phase-2-guidelines.md#service-migration) portion of the process is not included here, and the index code still uses entities-related functions to acces its data.
