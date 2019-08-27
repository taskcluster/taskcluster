---
title: Monitoring Services
---

Taskcluster has several background processes that you should ensure are running on a schedule. Any of the following will generate messages
of the form:

```json
{
  "Type": "monitor.periodic",
  "Logger": "<Logger>",
  "Fields": {
    "name": "<Name>"
  }
}
```

They will also have Fields for `status`, `duration`, and a serialized `error` if an error occured.

The processes that have `continuous` for their dedaline and schedule run every few minutes and should complete fairly quickly. The rest
have their schedules and maximum allowed duration defined here. All times are relative to the timezone of the k8s master.

<!-- GENERATED; DO NOT EDIT -->
| Service        | Name                   | Logger                     | Deadline (seconds) | Schedule    |
| -------------- | ---------------------- | -------------------------- | ------------------ | ----------- |
| auth           | purgeExpiredClients    | taskcluster.auth           | 86400              | At 12:00 AM |
| github         | sync                   | taskcluster.github         | 86400              | At 12:00 AM |
| hooks          | expires                | taskcluster.hooks          | 86400              | At 12:10 AM |
| index          | expire                 | taskcluster.index          | 86400              | At 12:00 AM |
| purge-cache    | expireCachePurges      | taskcluster.purge-cache    | 86400              | At 12:00 AM |
| queue          | claimResolver          | taskcluster.queue          | continuous         | continuous  |
| queue          | deadlineResolver       | taskcluster.queue          | continuous         | continuous  |
| queue          | dependencyResolver     | taskcluster.queue          | continuous         | continuous  |
| queue          | expireArtifacts        | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireTask             | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireTaskGroups       | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireTaskGroupMembers | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireTaskGroupSizes   | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireTaskDependency   | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireTaskRequirement  | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireQueues           | taskcluster.queue          | 86400              | At 12:00 AM |
| queue          | expireWorkerInfo       | taskcluster.queue          | 86400              | At 12:00 AM |
| secrets        | expire                 | taskcluster.secrets        | 600                | Every hour  |
| web-server     | scanner                | taskcluster.web-server     | 86400              | At 12:00 AM |
| worker-manager | provisioner            | taskcluster.worker-manager | continuous         | continuous  |
| worker-manager | workerscanner          | taskcluster.worker-manager | continuous         | continuous  |
| worker-manager | expire-workers         | taskcluster.worker-manager | 86400              | At 12:00 AM |
| worker-manager | expire-worker-pools    | taskcluster.worker-manager | 86400              | At 01:00 AM |
| worker-manager | expire-errors          | taskcluster.worker-manager | 86400              | At 12:10 AM |