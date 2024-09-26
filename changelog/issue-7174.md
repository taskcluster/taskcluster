audience: users
level: major
reference: issue 7174
---
Queue service now emits pulse messages to the `exchange/taskcluster-queue/v1/task-exception` exchange when a task has an exception that is automatically retried.
