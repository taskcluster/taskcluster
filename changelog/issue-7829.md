audience: users
level: patch
reference: issue 7829
---
Fix a bug that prevented all-resolved tasks from getting scheduled if they
depended on a task that was also part of an all-completed dependency and that
all-completed task was processed before the all-resolved one
