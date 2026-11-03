audience: worker-deployers
level: minor
reference: issue 9412
---
Generic Worker now only calls Worker Manager's `shouldWorkerTerminate` endpoint when worker-runner supports the new `should-worker-terminate` capability, which it does for the `aws`, `azure`, and `google` providers. Static and standalone workers no longer make this call, since Worker Manager never makes termination decisions for them, and once again exit when `idleTimeoutSecs` is reached instead of resetting the idle timer indefinitely as they have since v96.7.1. Upgrade worker-runner along with generic-worker: with an older worker-runner, generic-worker will not consult Worker Manager.
