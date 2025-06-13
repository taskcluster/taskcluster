audience: worker-deployers
level: minor
reference: issue 7770
---
Generic Worker: adds additional resource monitoring auto-abortion configuration to better fine-tune how your worker aborts running task processes.

  * `absoluteHighMemoryThreshold`: The minimum amount of available memory (in bytes) required before considering task abortion. If available memory drops below this value, it may trigger an abort. Default: `524288000` (500MiB).
  * `relativeHighMemoryThreshold`: The percentage of total system memory usage that, if exceeded, contributes to the decision to abort the task. Default: `90`.
  * `allowedHighMemoryDurationSecs`: The maximum duration (in seconds) that high memory usage conditions can persist before the task is aborted. Default: `5`.

Generic Worker will auto-abort a task if the total system memory used percentage is greater than `relativeHighMemoryThreshold` _AND_ the available memory is less than `absoluteHighMemoryThreshold` for longer than `allowedHighMemoryDurationSecs`, unless `disableOOMProtection` is enabled.
