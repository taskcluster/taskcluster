audience: worker-deployers
level: patch
reference: issue 9419
---
Generic-worker now asks worker-runner to shut down the instance after a graceful termination (exit code 72, `WORKER_SHUTDOWN`). Before, the instance stayed idle until the cloud provider terminated it.
