audience: users
level: minor
reference: issue 6147
---
Adds `task.payload.onExitStatus.purgeCaches` feature to generic worker to bring to parity with an existing docker worker feature.

`purgeCaches` is an array of exit status code integers that the user wants all caches associated with the task to be purged.
