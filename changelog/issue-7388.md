audience: worker-deployers
level: minor
reference: issue 7388
---
Generic Worker now supports running multiple tasks concurrently via the new `capacity` configuration option. When `capacity` is set to a value greater than 1, the worker will claim and execute up to that many tasks in parallel. This feature is available for the insecure engine and the multiuser engine when `headlessTasks` is enabled. Each concurrent task receives isolated ports for LiveLog, Interactive, and TaskclusterProxy features. Graceful shutdown properly waits for all running tasks to complete.
