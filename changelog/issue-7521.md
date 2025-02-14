audience: worker-deployers
level: patch
reference: issue 7521
---
Generic Worker: fixes an issue introduced in v81.0.0 where `TASK_USER_CREDENTIALS` env var wasn't written to the task's environment if `task.payload.features.runTaskAsCurrentUser` was enabled.
