audience: users
level: minor
reference: issue 6845
---
D2G now provides support for the (discontinued) disableSeccomp capability which was removed from Docker Worker, but was still used by the bugmon fuzzing project in the Community taskcluster environment. This was added to ease the migration path of this project from Docker Worker to Generic Worker.
