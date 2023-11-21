audience: general
level: patch
---
Generic Worker: Adds validation that the task user is able to read and execute the generic-worker binary on startup of the worker. If the task user is not able to read and execute the binary, the worker will exit with exit code 69, internal error.
