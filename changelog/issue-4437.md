audience: users
level: major
reference: issue 4437
---
The `hooks.triggerHook` and `hooks.triggerHookWithToken` methods now returns only `{taskId: .., status: { taskId: .. } }`, where previously they returned an entire task-status data structure.  Callers which require those status fields must be modified to request the status directly (`queue.status`) before this upgrade occurs.
