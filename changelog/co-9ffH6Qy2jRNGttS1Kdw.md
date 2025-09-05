audience: users
level: major
---
generic-worker/d2g no longer support the `dind` and `dockerSave` features from the docker-worker payload.  Tasks requesting those features will fail with an exception.
