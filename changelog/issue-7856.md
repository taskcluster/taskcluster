audience: users
level: patch
reference: issue 7856
---

Fixes `queue.taskQueueCounts()` numbers for the total claimed tasks.
Due to the internal structure some task/runs might have had duplicate entries in the `queue_claimed_tasks` table
which led to slightly higher counts returned by `queue_claimed_tasks_count(taskQueue)` function.
