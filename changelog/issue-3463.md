audience: users
level: patch
reference: issue 3463
---
This release fixes a bug that may occur when a new task is quickly inserted
twice into the index service. When the bug is triggered, one of the insert
calls would fail with a server error. With this fix, the UNIQUE_VIOLATION error
is caught, and the previously failed insert will update the task if the rank is
higher.
This bug was first seen in v37.3.0
