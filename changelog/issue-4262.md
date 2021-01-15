audience: admins
level: major
reference: issue 4262
---
Tasks now have a `projectId` property that can be used to distinguish tasks for different purposes run in the same Taskcluster deployment.  The `queue.createTask` method now requires scope `queue:create-task:project:<projectId>`, permitting administrative control over which clients can create tasks for which projects.

The default `projectId` is `none`.  To avoid permissions errors on upgrade, _we recommend that `queue:create-task:project:none` be added to the `anonymous` role_ before upgrading to this version.  Once the upgrade is complete, callers may be modified to create tasks with non-default `projectId` and given appropriate scopes.
