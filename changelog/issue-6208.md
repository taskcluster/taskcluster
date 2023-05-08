audience: users
level: patch
reference: issue 6208
---
Return a malformed payload error if `payload.features.interactive` is enabled in the task definition, while the `enableInteractive` worker config is false.
