audience: users
level: minor
reference: issue 3652
---

Adds `cancelTaskGroup` method for queue service.
This will cancel all scheduled/pending/running tasks.
It does not prevent creation of new tasks for the task group.
