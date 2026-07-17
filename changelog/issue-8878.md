audience: users
level: patch
reference: issue 8878
---
Fixed queue worker metrics incorrectly dropping to zero when a worker pool had pending tasks but no claimed tasks.
