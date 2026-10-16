audience: general
level: minor
reference: bug 2081655
---

Worker-manager `worker-pool-error` pulse messages now include an optional `errorCode` with the provider-specific error code, such as Google GCE operation codes (e.g. `ZONE_RESOURCE_POOL_EXHAUSTED`) or Azure error codes.
Operation errors reported by the Google provider now also include `workerId` and `workerGroup` in these messages, and store the code as `errorCode` instead of `code` in the error's `extra` data.
