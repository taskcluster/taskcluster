audience: users
level: minor
reference: issue 5804
---

Adds pagination to the hooks last fires api call.

This prevents loading all last fires for the hooks that have thousands of records, which results in 500 errors.
Changes the behaviour of the existing `get_last_fires` function by using a different sort column - creation time instead of task_id.
