audience: users
level: patch
reference: issue 8625
---
Explicitly ensure the GitHub service can fetch the well-defined artifacts used
as integration points. Previously the `static/taskcluster/github` client
attempted to assume the hook role for hook-created tasks, which it does not
have scopes to do.
