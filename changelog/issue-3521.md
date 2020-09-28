audience: users
level: patch
reference: issue 3521
---
Taskcluster proxy now automatically adds a `Content-Type: application/json` header if none is specified. This is to match legacy behavior and should be
unnoticed by users.