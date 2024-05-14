audience: worker-deployers
level: minor
reference: issue 6979
---
Generic Worker multiuser engine on Linux now sets environment variable`XDG_RUNTIME_DIR` to `/run/user/<UID>` in task command processes (unless Generic Worker config setting `runTasksAsCurrentUser` is set to `true`).
