audience: general
level: minor
---
This release updates the `docker-worker-websocket-client` and
`docker-worker-websocket-server` libraries, used by `docker-worker` to execute
commands inside a running container. These updates fix a bug when reading and
writing data to the process in the container, which may have been broken since
2015, and be a part of why VNC was broken
(see [issue 3542](https://github.com/taskcluster/taskcluster/issues/3542#issuecomment-746934147)).
This change required for Node v16, and may affect tasks that use this library like the
[interactive feature](https://docs.taskcluster.net/docs/reference/workers/docker-worker/features#feature-interactive).
