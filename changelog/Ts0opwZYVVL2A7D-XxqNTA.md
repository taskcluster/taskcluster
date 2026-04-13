audience: users
level: patch
---
The claim resolver no longer stalls between batches, only backing off when the
queue is drained. It also now properly uses its configured batch size instead
of being hardcoded to 32.
