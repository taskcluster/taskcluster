# Monitoring Suggestions

Taskcluster has several background processes that you should ensure are running.

| Service          | Proc                   | Logger                       | Type | Deadline (seconds) | Schedule    |
| ---------------- | ---------------------- | ---------------------------- | ---- | ------------------ | ----------- |
| auth             | purgeExpiredClients    | taskcluster.auth             | TODO | 86400              | At 12:00 AM |
| built-in-workers | server                 | taskcluster.built-in-workers | TODO | continuous         | continuous  |
| github           | worker                 | taskcluster.github           | TODO | continuous         | continuous  |
| github           | sync                   | taskcluster.github           | TODO | 86400              | At 12:00 AM |
| hooks            | scheduler              | taskcluster.hooks            | TODO | continuous         | continuous  |
| hooks            | listeners              | taskcluster.hooks            | TODO | continuous         | continuous  |
| hooks            | expires                | taskcluster.hooks            | TODO | 86400              | At 12:10 AM |
| index            | handlers               | taskcluster.index            | TODO | continuous         | continuous  |
| index            | expire                 | taskcluster.index            | TODO | 86400              | At 12:00 AM |
| notify           | irc                    | taskcluster.notify           | TODO | continuous         | continuous  |
| notify           | handler                | taskcluster.notify           | TODO | continuous         | continuous  |
| purge-cache      | expireCachePurges      | taskcluster.purge-cache      | TODO | 86400              | At 12:00 AM |
| queue            | claimResolver          | taskcluster.queue            | TODO | continuous         | continuous  |
| queue            | deadlineResolver       | taskcluster.queue            | TODO | continuous         | continuous  |
| queue            | dependencyResolver     | taskcluster.queue            | TODO | continuous         | continuous  |
| queue            | expireArtifacts        | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireTask             | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireTaskGroups       | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireTaskGroupMembers | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireTaskGroupSizes   | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireTaskDependency   | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireTaskRequirement  | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireQueues           | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| queue            | expireWorkerInfo       | taskcluster.queue            | TODO | 86400              | At 12:00 AM |
| secrets          | expire                 | taskcluster.secrets          | TODO | 600                | Every hour  |
| web-server       | scanner                | taskcluster.web-server       | TODO | 86400              | At 12:00 AM |
| worker-manager   | provisioner            | taskcluster.worker-manager   | TODO | continuous         | continuous  |
| worker-manager   | workerscanner          | taskcluster.worker-manager   | TODO | continuous         | continuous  |
| worker-manager   | expire-workers         | taskcluster.worker-manager   | TODO | 86400              | At 12:00 AM |
| worker-manager   | expire-worker-pools    | taskcluster.worker-manager   | TODO | 86400              | At 01:00 AM |
| worker-manager   | expire-errors          | taskcluster.worker-manager   | TODO | 86400              | At 12:10 AM |