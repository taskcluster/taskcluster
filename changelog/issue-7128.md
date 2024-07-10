audience: users
level: patch
reference: issue 7128
---

Use `--remove-home` instead of `--remove-all-files` when deleting a user on Linux. This ensures that caches that may still be owned (in whole or in part) by the task user are not deleted.
