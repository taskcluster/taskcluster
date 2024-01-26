audience: users
level: patch
reference: issue 6798
---
Generic Worker now includes the original Docker Worker task definition in the chain of trust certificate, if the task payload is a Docker Worker task payload. Previously, it was including the internal Generic Worker representation of the task definition.
