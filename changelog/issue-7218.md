audience: worker-deployers
level: patch
reference: issue 7218
---
Generic Worker: Unset cached interactive username when we unexpectedly receive a non-task username.

This will fix errors like: `interactive username gdm does not match task user task_173764785573833`.
