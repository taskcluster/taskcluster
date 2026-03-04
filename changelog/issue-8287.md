audience: users
level: minor
reference: issue 8287
---
Add ability to provide `taskId` in the payload to `triggerHook` and `triggerHookWithToken`. The hook service will look for `taskId` in the payload and use it to set the task ID if provided.
