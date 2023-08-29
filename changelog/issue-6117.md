audience: users
level: major
reference: issue 6117
---

`workerManager.getWorker` returns worker even if it is quarantined and expired.
This is to avoid confusion in the UI when a worker is linked in UI, still exists in database, but page returns `404`.
