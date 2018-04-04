---
title: Task Life-Cycle
description: Phases of a task life-cycle.
order: 50
---
The diagram below outlines the task life-cycle. Transitions drawn by solid
black lines are initiated by workers. While dashes transitions are initiated
at the initiative of the queue, or its consumers.

![Task Life Cycle](./task-life-cycle.svg)

## Unscheduled Tasks
When a task is created it is _unscheduled_ until (i) it is scheduled by
invocation of `queue.scheduleTask`, or (ii) all of its dependencies have been
satisfied. Notice that if a task doesn't have any dependencies, it will
transition from _unscheduled_ to _pending_ as soon as it is created.

If creating a task that is to be scheduled later by some external service, the
task can be given a self-dependency, which will cause it to remain _unscheduled_
until: (a) `scheduleTask` is called, or (b) `task.deadline` is exceeded.

By default a task becomes _pending_ when all dependencies in
`task.dependencies` have been resolved _completed_. These semantics can be
tweaked by setting `task.requires = 'all-resolved'`, which causes the task to
become _pending_ when all dependencies have been resolved as either _completed_,
_failed_, or _exception_. If you need semantics other than `all-completed` or
`all-resolved`, you can implement that using an intermediary decision task with
`all-resolved` semantics.  

## Pending Tasks
When a task becomes _pending_ it can be claimed by a worker that wishes to
complete the task. Once claimed the task atomically transitions to the _running_
state.

A task can become _pending_ more than once, e.g. if the worker crashes while
processing the task. To track this a task may have one or more _runs_. A task
without any runs is _unscheduled_, a task with pending run is said to _pending_.

Runs are number starting from zero, and only the last _run_ can be _pending_ or
_running_, ensuring that two workers aren't working on the same task at the same
time.

If the task isn't claimed by a worker before `task.deadline` the pending _run_,
and by implication the task, will be resolved as _exception_. The same happens
if the task is canceled.

The queue exposes an approximate number of pending tasks for each
`provisionerId`/`workerType` combination, for use by provisioners that are able
to dynamically scale up the number of workers.

## Running Tasks
When a _pending_ task is claimed by a worker it becomes _running_.
More accurately it is the latest run from the task that is claimed by a worker,
and hence, transitioning the state of the run/task from _pending_ to _running_.

While a task/run is _pending_ it must be repeatedly reclaimed by the worker.
This is indicated by the `takenUntil` property. If not reclaimed before
`takenUntil` the _run_ is resolved as _exception_, and a if retries aren't
exhausted a new _pending_ run will be added to task, rendering the task
_pending_ again. This ensures that tasks will be retried if workers disappear.

When claiming and reclaiming tasks the worker will receive temporary credentials
from the queue. These can be used to (i) upload artifacts, (ii) reclaim the
task/run, and, (iii) resolve the task. Finally, these temporary credentials also
cover `task.scopes`, allowing the worker to use any scope granted to the task.

## Completed/Failed Tasks
Once execution of a task is finished and all artifacts/logs have been uploaded,
the worker processing the task will transition the task/run to _completed_ or
_failed_ using `reportCompleted`/`reportFailed`.

Once a task enters this state it is resolved, and will remain stable until its
expiration date. It's possible to run the task again, by calling `rerunTask`
creating a new _pending_ run. However, this strongly discouraged for simplicity.

## Task Exceptions
If a worker processing a task decides to shutdown, detects an internal error, or
determines that the `task.payload` is invalid, it can resolve the _run_ as
_exception_. Depending on the `reason` given for the exception resolution, and
whether or not retries have been exhausted a new _pending_ run may be created.
For example, exceptions with reason `malformed-payload` will never be retried.

A task may also enter the exception state, if it is canceled, the deadline is
exceeded or the worker disappears and retries have been exhausted.

Whenever, a task is immediately retried, the _run_ will be resolved _exception_,
but the _task_ never enters the _exception_ state, and no message is published
about the _run_ that is resolved _exception_. A message signaling _exception_
will only be published if no automatic retry is initiated.

## Task Expiration
When a task is resolved, _completed_, _failed_, or _exception_, it will sit
around until `task.expires` at which point the task will be deleted by
expiration.
