audience: users
level: minor
reference: issue 5621
---

Github service now automatically cancels older task groups to avoid redundancy when there are multiple builds for the same commit sha or pull request. This behavior can be disabled by setting `autoCancelPreviousChecks` to `false` in the `.taskcluster.yml` file.
