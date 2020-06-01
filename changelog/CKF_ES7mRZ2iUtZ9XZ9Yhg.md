audience: worker-deployers
level: patch
reference: bug 1607605
---
Generic-worker now supports shutting down gracefully when instructed to do so by worker-runner, such as when a cloud VM is being terminated.
