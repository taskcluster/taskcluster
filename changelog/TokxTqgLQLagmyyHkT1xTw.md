audience: worker-deployers
level: patch
---
Generic Worker (Windows): properly logs out `win32.LoadUserProfile()` errors with the user's `syscall.Token` in hex format instead of a quoted string.
