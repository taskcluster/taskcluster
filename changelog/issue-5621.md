audience: admins
level: patch
reference: issue 5621
---

Extend `static/taskcluster/github` client with two scopes that are necessary to seal and cancel previously created task groups: `queue:cancel-task-group:taskcluster-github` and `queue:seal-task-group:taskcluster-github`.
When github repository is using a different schedulerId than `taskcluster-github`, then it might be necessary to update corresponding `repo:github.com/` roles with correct scopes.
