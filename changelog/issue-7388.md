audience: worker-deployers
level: minor
reference: issue 7388
---
Generic Worker now supports running multiple tasks concurrently via the new `capacity` configuration option.

**Configuration:**

- `capacity` (uint8, default: `1`, max: `255`) - the number of tasks the worker will claim and execute in parallel.
- When `capacity` is `1`, behavior is unchanged from previous releases.
- When `capacity` > 1, each task slot is allocated a block of 4 ports offset from the configured base ports (`livelogPortBase`, `interactivePort`, `taskclusterProxyPort`). Deployers must ensure these base ports are spaced far enough apart to avoid overlapping ranges. The worker validates this at startup and exits with an error if ranges collide.

**Engine support:**

- Insecure engine: supported.
- Multiuser engine: supported only when `headlessTasks` is enabled. Non-headless multiuser mode (which reboots between tasks) is restricted to `capacity` = 1.

**Task isolation:**

- Each concurrent task receives its own task directory under `tasksDir`, its own set of dynamically allocated ports for LiveLog, Interactive, and TaskclusterProxy, and (in multiuser mode) its own OS user.
- Caches and mounts are protected by per-cache read/write locks so that multiple tasks can read from the same cache concurrently while writes are serialized.
- Docker image loading (D2G) uses file-level locking so parallel tasks sharing the same image coordinate without redundant loads.
- TaskclusterProxy now verifies that incoming connections originate from the OS user running the task, preventing one task from accessing another task's credentials. This is implemented via `/proc/net/tcp` on Linux, `lsof` on macOS, and `GetExtendedTcpTable` on Windows.

**Constraints:**

- The `runTaskAsCurrentUser` and `runAsAdministrator` task features are not supported when `capacity` > 1 and will return a `MalformedPayloadError` if requested.
- Graceful shutdown waits for all running tasks to complete before the worker exits.
- `numberOfTasksToRun` is respected across all concurrent slots - the worker will not start more tasks than the configured total.
