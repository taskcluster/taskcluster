audience: users
level: minor
reference: issue 5961
---
Generic Worker now supports the `osGroups` feature on macOS, Linux and
FreeBSD. Support was already added to Windows in Generic Worker 6.0.0.

Example Linux/macOS task (requires `docker` to be installed on worker):

```
created: <timestamp>
deadline: <timestamp>
workerType: my-worker-type
provisionerId: mv-provisioner-id
scopes:
  - generic-worker:os-group:my-provisioner-id/my-worker-type/docker
payload:
  osGroups:
    - docker
  command:
    - - docker
      - run
      - --rm
      - ubuntu:latest
      - /usr/bin/echo
      - hello
  maxRunTime: 60
metadata:
  name: Ubuntu - docker test
  owner: pmoore@mozilla.com
  source: https://github.com/taskcluster/taskcluster/pull/6397
  description: Test calling docker from a Generic Worker task
```
