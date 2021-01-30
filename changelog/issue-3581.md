audience: users
level: major
reference: issue 3581
---
Client methods that took two separate provisionerId and taskQueueId parameters take now a 
single parameter (workerPoolId or taskQueueId depending on the service involved).
Affected methods are `queue.claimWork`, `queue.pendingTasks`, `purgeCache.purgeCache` and `purgeCache.purgeRequests`.
The API maintains compatibility at the URL level.

