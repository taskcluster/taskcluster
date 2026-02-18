audience: worker-deployers
level: patch
reference: issue 8291
---
Generic Worker: handles `SIGTERM` during task execution by triggering graceful termination, ensuring preempted tasks are properly resolved as `exception/worker-shutdown` instead of `exception/claim-expired`.
