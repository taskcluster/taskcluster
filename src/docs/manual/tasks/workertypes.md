---
filename: tasks/workertypes.md
title: Worker Types
order: 20
---

Workers execute tasks, but there are many types of workers. A task specifies a
single "worker type" by which it should be executed, using the two-part
namespace `<provisionerId>/<workerType>`.  The naming of the identifiers can be
a bit confusing: when we refer to a worker type, it is to the combination of
both identifiers. Thus `gcp-provisioner/persona-build` and
`rackspace-provisioner/persona-build` are completely different worker types,
despite sharing the same `workerType` identifier.

Workers of the same worker type all consume tasks from a single queue, as
[described later](/docs/manual/task-execution/queues), and as such are
interchangeable and have identical configurations.

The format of a task's `payload` property is specific to the worker that will
execute it, so defining a task requires knowledge of worker type's
configuration. If given a task with an inappropriate payload, a worker will
resolve the task with the reason `malformed-payload`.

You can explore the available worker types (after selecting a `provisionerId`)
at https://tools.taskcluster.net/provisioners.
