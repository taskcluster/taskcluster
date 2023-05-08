audience: users
level: patch
reference: issue 6208
---
Return a malformed payload error if `payload.features.interactive` is enabled in the task definition, while the `enableInteractive` worker config is false.

If you _do not_ require an interactive task, remove `payload.features.interactive` from the task definition.

If you _do_ require an interactive task, either:
* Contact the owner of worker pool and ask for interactive tasks to be enabled
* Use a worker pool that already allows interactive tasks (search for "enableInteractive: true" in the worker pool definition)
