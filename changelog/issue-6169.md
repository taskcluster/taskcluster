audience: users
level: minor
reference: issue 6169
---
Adds interactive shell support to generic-worker.

The worker configuration variable `enableInteractive` needs to be set to `true` to allow the interactive shell feature to be enabled. `enableInteractive` is disabled by default.

Once the worker configuration variable is set, the `interactive` feature can be enabled on a per-task basis.

To enable, set `task.payload.features.interactive` to `true`. And toggle on `Interactive` in the Create Task view of the UI.
