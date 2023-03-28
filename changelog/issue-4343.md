audience: admins
level: minor
reference: issue 4343
---

Workers can be quarantined with optional comment. `queue.quarantineWorker` accepts `quarantineInfo` string.
Quarantine details also include timestamp and clientId of the user who quarantined the worker.
This information can be fetched with `worker-manager.getWorker`.
`quarantineDetails` would be a list of all the quarantine requests made for the worker.
UI shows this history and allows to specify a comment for quarantine request.
