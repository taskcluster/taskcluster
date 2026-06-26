audience: users
level: patch
reference: issue 8751
---
The GitHub service now creates a build record for every unique `taskGroupId` defined in
`.taskcluster.yml`, so checks and statuses are reported for all task groups, not just
the first task's group.
