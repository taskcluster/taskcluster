audience: users
level: patch
reference: issue 9172
---
In the python client, importing `taskcluster.helper` before anything from `taskcluster.aio` no longer leaves `taskcluster.aio` without any of its clients
