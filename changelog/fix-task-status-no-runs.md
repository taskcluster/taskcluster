level: patch
audience: users
---
Fix a panic in `taskcluster task status` and `taskcluster task artifacts` when the task has no runs (e.g., is in the `unscheduled` state). These commands now return a clear error message instead of crashing.
