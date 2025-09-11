audience: users
level: patch
reference: issue 7605
---

Fixes duplicate tasks shown in claimed tasks list. This can happen when task is being reclaimed
and multiple entries might still exist in queue_claimed_tasks table
