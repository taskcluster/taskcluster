audience: deployers
level: minor
reference: issue 6716
---

Services now support graceful server termination by listening to `SIGTERM` and letting existing connections to be served while rejecting new connections.
