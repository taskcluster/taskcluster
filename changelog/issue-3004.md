audience: users
level: patch
reference: issue 3004
---
Generic-worker now uses the task's credentials to fetch artifacts specified in the `mounts` property of the task's payload.  This will allow use of private artifacts in mounts.
