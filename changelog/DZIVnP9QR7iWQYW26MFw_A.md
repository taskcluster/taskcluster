audience: worker-deployers
level: major
---
Generic Worker: Adds `containerEngine` worker config option to select between `docker` and `podman` to be used during D2G payload translations.

Default is `docker` and this value will be overridden by `task.payload.capabilities.containerEngine`, if specified.
