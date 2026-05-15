audience: users
level: patch
reference: issue 8631
---
GitHub check runs now report `started_at` based on the time the task was actually claimed by a worker, rather than when the task was first defined. Previously, the GitHub Checks UI showed elapsed time from when a task was first scheduled, making queued/pending time appear as running time.
