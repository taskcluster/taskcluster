audience: worker-deployers
level: minor
reference: issue 9202
---
Generic Worker (Linux, with D2G enabled) now prunes docker resources when the docker data-root (as reported by `docker info`) is low on disk space, rather than when `tasksDir` is. Previously, a docker data-root on a separate filesystem could fill up unchecked, and a low `tasksDir` pruned docker resources even though that freed no space in `tasksDir`. While `docker info` fails (e.g. before the docker daemon has started), free space is measured in `tasksDir` as before, and the lookup is retried every minute.

The new `requiredDockerDiskSpaceMegabytes` config setting sets the free space required in the docker data-root. It defaults to `0`, which means `requiredDiskSpaceMegabytes` is used, so nothing changes when the docker data-root shares a filesystem with `tasksDir`. In that case, don't set it lower than `requiredDiskSpaceMegabytes`. If your docker data-root is on a separate filesystem smaller than `requiredDiskSpaceMegabytes`, set it to a value that filesystem can satisfy, otherwise docker resources will be pruned whenever the worker is idle.
