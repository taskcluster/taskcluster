audience: worker-deployers
level: patch
---
Fixes errors handling for upgraded googleapis packages. Instance creation errors were sent differently,
which didn't allow to log some provision exceptions.
