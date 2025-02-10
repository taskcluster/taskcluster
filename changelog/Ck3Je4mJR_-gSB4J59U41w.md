audience: worker-deployers
level: major
---
Generic Worker: feature `runTaskAsCurrentUser` (note: `Task` not `Tasks`) has been added to replace the previous global task config setting `runTasksAsCurrentUser` (which is no longer supported). Worker pools can elect to enable or disable the feature with boolean config setting `enableRunTaskAsCurrentUser`. Tasks with the feature enabled (`task.payload.features.runTaskAsCurrentUser = true`) require scope `generic-worker:run-task-as-current-user:<provisionerID>/<workerType>`.

This change was introduced in order that access to this privileged feature are guarded not only by worker config settings, but also by task scopes, and furthermore the feature must be explicitly requested, in order that tasks do not unintentionally inherit the feature by virtue of overgenerous scopes or unintentionally running on a pool with the feature enabled.
