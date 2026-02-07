audience: users
level: patch
reference: issue 8171
---
Task creation in the UI now calls the Queue API directly instead of routing
through GraphQL, fixing 413 errors when creating tasks with large payloads
(up to the Queue API's 10MB limit).
