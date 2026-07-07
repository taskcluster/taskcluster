audience: worker-deployers
level: patch
reference: issue 8664
---

When a worker-manager `checkWorker` call times out, the scanner now aborts the in-flight provider API call and logs a warning instead of reporting an error, since the worker is re-checked on the next loop. Other `checkWorker` failures are still reported as errors.
