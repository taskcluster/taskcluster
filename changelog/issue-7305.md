audience: users
level: patch
reference: issue 7305
---
Generic Worker multiuser engine task log headers now include generic-worker
config properties `runTasksAsCurrentUser` and `headlessTasks` in order to help
troubleshoot unexpected behaviour. These properties fundamentally affect how
the task runs, so it is useful to log them together with the other worker
environment information.

Sentry reports also now include this information.
