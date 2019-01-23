---
filename: task-execution/queues.md
title: Queues
order: 10
---

The [queue service](/docs/reference/platform/queue), hosted at
**`queue.taskcluster.net`**, is the centralized coordinator that is responsible
for accepting tasks, managing their state, and assigning them to workers that
claim them. It also manages the artifacts and runs attached to tasks.

The queue service maintains the task queues. Task queues are named, with the
names having the form `<provisionerId>/<workerType>` (more on provisioners in a
[later chapter](/docs/manual/task-execution/provisioning)). Tasks are handled in
FIFO order (except for tasks of different priority), so that tasks added
earliest will be executed first.

A dependent task is not available to be claimed by workers until all of the
tasks it depends on have completed. Task deadlines ensure that no task remains
in enqueued forever: the task is resolved when the deadline has passed, whether
it has been executed or not.

When resources permit, we prefer to have empty queues by executing all tasks
when they are submitted to the queue. Thus the focus is on starting new tasks
quickly, rather than optimizing behavior with long queues of pending tasks.
Resources, of course, do not always permit.

The Taskcluster Queue does _not_ require any configuration or programmatic
changes in order to start supporting a new worker. A task defines which
`provisionerId` and `workerType` it requires, as string fields. So long as a
worker has the required scopes to claim a task from the given queue
(`<provisionerId>/<workerType>`), the Queue will cooperate by providing task
information, and assigning tasks to the worker. This means no Queue downtime
for the roll out of a new worker -- you can hook your toaster up to
Taskcluster, as long as it has the right scopes. It also means one-off workers
can be written for one-off jobs, if required.