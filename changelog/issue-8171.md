audience: users
level: patch
reference: issue 8171
---
Increase the web-server GraphQL body size limit to 10MB to match the Queue API, fixing 413 errors when creating tasks with large payloads via the UI.
