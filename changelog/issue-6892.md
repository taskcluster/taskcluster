audience: developers
level: minor
reference: issue 6892
---
Worker Manager now special-cases `registerWorker` API calls with provisionerId
`test-provisioner-id`. It responds as if the call was successful with fake
`credentials`, `expiry`, and `secret`, but the real `workerConfig`, if it
exists.
