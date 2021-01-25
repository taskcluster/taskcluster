audience: users
level: minor
reference: issue 3580
---
The queue service API responses will now include the taskQueueId, which will match provisionerId/workerType,
which are also returned. Also, it is now possible to create tasks supplying a taskQueueId instead of the
separate provisionerId and workerType identifiers.
