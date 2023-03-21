audience: users
level: major
reference: issue 3652
---

It is now possible to cancel a sealed task group by calling the `queue.cancelTaskGroup` API method.
This will cancel all scheduled/pending/running tasks within given group.

`taskcluster group cancel` was removed from shell client,
as it is available under `taskcluster api queue cancelTaskGroup` now.
