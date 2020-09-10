audience: worker-deployers
level: patch
reference: issue 3483
---
Faced with an error reclaiming a task, docker-worker will now correctly call `reportException` with reason `internal-error`.
