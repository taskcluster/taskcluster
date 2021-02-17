audience: users
level: patch
reference: issue 4417
---
In a followup to a bug partially fixed in v41.0.1, the `hooks.triggerHook` function no longer crashes due to the `projectId` property from `queue.createTask`.
