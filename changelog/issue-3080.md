audience: worker-deployers
level: patch
reference: issue 3080
---
Docker-worker is now more careful to shut down only when it is idle and has not begun to claim a task, avoiding race conditions that could lead to `claim-expired` tasks.
