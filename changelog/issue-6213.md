audience: general
level: major
reference: issue 6213
---
The Generic Worker Docker Engine was an experimental engine that was never used
in production. It was an intended starting point for adding support for
docker-worker style payloads. However, a new approach to running Docker Worker
payloads in the multiuser engine was agreed, and is under [active
development](https://github.com/orgs/taskcluster/projects/14). This will
provide the same functionality that the Docker Engine was intended to provide.
Therefore the old, incomplete, and unused docker engine has been removed.
