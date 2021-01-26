audience: admins
level: minor
reference: issue 4270
---
Task manipulation (rerun, cancel, schedule) is now controlled by scopes related to the task's `projectId`, completing implementation of [RFC#163](https://github.com/taskcluster/taskcluster-rfcs/blob/main/rfcs/0163-project-id.md).  With this change, and with the inclusion of `projectId` in task definitions, administrators can control task manipulation by granting `queue:<verb>-task-in-project:<projectId>` scopes to the appropriate entities.
