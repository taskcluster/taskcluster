audience: users
level: patch
---
Generic Worker now correctly reports the Worker Pool ID when an interactive task is attempted on a worker pool with the interactive feature disabled. Previously the task log would report the Worker Pool ID in the `exception/malformed-payload` task run as `<workerGroup>/<workerType>`; now it correctly reports it as `<provisionerId>/<workerType>`. The Interactive feature is considered disabled when Generic Worker config setting `enableInteractive` is either absent or explicitly set to `false` in the Generic Worker config.
