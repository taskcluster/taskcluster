audience: general
level: minor
reference: bug 2081655
---

Worker-manager `worker-stopped` pulse messages now include an optional `reason`, such as `instance TERMINATED` or `instance not found`, when the provider can tell why the worker is considered stopped.
The Google and AWS providers set it, and the `worker-stopped` log entry carries the same `reason` field.
`worker-requested` and `worker-running` messages are unchanged.
