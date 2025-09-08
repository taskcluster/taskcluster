audience: worker-deployers
level: patch
---
Worker Runner (Windows): capture Generic Worker service exit code and exit early if the worker is rebooting, preventing a Worker Manager `removeWorker` API call.
