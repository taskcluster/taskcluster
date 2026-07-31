audience: users
level: patch
reference: issue 8942
---
Fix workers panicking if a task that's not resolved yet would exhaust enough
disk space for the worker to not meet their minimum disk space required to
claim new tasks.
