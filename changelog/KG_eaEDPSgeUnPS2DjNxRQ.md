audience: users
level: major
---
Removed all mentions of the unused queue actions feature.

The `actions` property is removed from the responses of
`queue.listProvisioners`, `queue.getProvisioner`, `queue.getWorkerType`,
`queue.getWorker`, and `workerManager.worker`, from the corresponding GraphQL
types, and from the web UI.
