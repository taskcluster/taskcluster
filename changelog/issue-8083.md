audience: worker-deployers
level: patch
reference: issue 8083
---
Generic Worker (windows): adds retries to the win32 `LoadUserProfile` call to help prevent `The device is not ready` worker errors.
