audience: users
level: major
reference: issue 3652
---

It is now possible to cancel sealed task group by using `cancelTaskGroup` method.
This will cancel all scheduled/pending/running tasks within given group.

`taskcluster group cancel` was removed from shell client,
as it is available under `taskcluster api queue cancelTaskGroup` now.
