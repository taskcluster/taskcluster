audience: users
level: patch
reference: issue 6109
---

The worker-manager methods `createWorker`, `listWorkersForWorkerGroup`,
`updateWorker`, and `worker` had an extraneous colon (`:`) character in their
URL path.  This colon has been removed.  The old paths (containing the colon)
will continue to work, but the new paths are preferred.
