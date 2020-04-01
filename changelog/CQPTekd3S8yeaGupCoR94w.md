audience: worker-deployers
level: patch
---
Now, if the worker process running in aws/gcp exits, it will be requested to worker-manager to terminate the instance.
