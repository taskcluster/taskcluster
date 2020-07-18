audience: deployers
level: minor
reference: issue 2932
---
In this version, the Queue service's use of task- and task-group-related database tables is rewritten to access them directly, rather than via taskcluster-lib-entities.
