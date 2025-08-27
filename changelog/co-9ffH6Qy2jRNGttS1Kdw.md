audience: users
level: major
---
The `dind` and `dockerSave` features are no longer supported in docker-worker
payloads (whether in docker-worker itself or in generic-worker via D2G).  Tasks
requesting those features will fail with an exception.

