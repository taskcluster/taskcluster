audience: users
level: patch
reference: issue 9203
---
Generic Worker no longer waits for `docker rm` before resolving a d2g task. The task's container is now removed after the task has been resolved, so a slow removal no longer delays the resolution.
