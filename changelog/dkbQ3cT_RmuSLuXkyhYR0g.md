audience: users
level: minor
---
Queue service allows changing the priority of unresolved tasks.
Two new endpoints are being introduced:
- queue.changeTaskPriority
- queue.changeTaskGroupPriority

This is the implementation of the [RFC190](https://github.com/taskcluster/taskcluster-rfcs/pull/190)
