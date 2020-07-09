audience: deployers
level: major
reference: issue 3112
---
Queue's artifacts table is upgraded to a normalized format. For deployments with
many (millions) of artifacts, this migration will take too long to perform
online, and should be performed in a scheduled downtime. Note that the ["service migration"](https://github.com/taskcluster/taskcluster/blob/master/dev-docs/postgres-phase-2-guidelines.md#service-migration) portion of the process is not included here, and the queue artifact code still uses entities-related functions to acces its data.
