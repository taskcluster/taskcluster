audience: users
level: patch
reference: issue 4417
---
The `hooks.triggerHook` method no longer fails with a 500 error, and now correctly includes the `taskQueueId` property.
