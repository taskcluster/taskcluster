audience: worker-deployers
level: patch
reference: issue 7650
---
Generic Worker (windows): fixes cache mount issue where generic worker fails to reset permissions on the cache directory. First noticed in [v81.0.3](https://docs.taskcluster.net/docs/changelog?version=v81.0.3).
