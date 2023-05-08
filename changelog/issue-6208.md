audience: users
level: patch
reference: issue 6208
---
Return a malformed payload error if `task.payload.features.interactive` is enabled, while the `enableInteractive` worker config is false.
