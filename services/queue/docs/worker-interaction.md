---
title: Queue-Worker Interaction
description: How workers interacts with the queue to process tasks.
---
_This document outlines how workers interact with the queue in-order to process
tasks. This is intended as required reading for any worker-implementor._

Sequence chart below outlines the worker-queue interaction when a task is
successfully claimed, executed and resolved. Obviously, there is a few corner
cases when dealing with internal errors, invalid payloads and early worker
termination, sections here outline how to handle all these cases.

![Common queue-worker interaction](queue-worker-interaction.svg)


## Claiming Pending Tasks
A worker must at a minimum have the following configuration to claim tasks:
 * A `workerGroup` and `workerId` that uniquely identifies the worker,
 * A `provisionerId` and `workerType` that the identifies the pool of workers
   the worker belongs to, and,
 * Credentials with the following scopes
   * `queue:claim-work:<provisionerId>/<workerType>`, and,
   * `queue:worker-id:<workerGroup>/<workerId>`.

Notice that the credentials may be temporary, this allows provisioners in
dynamically scaling cloud setups to grant new virtual machines credentials
that expire, hence, avoiding the need to hardcode permanent credentials into
virtual machine images.

When a worker is idle and wishes to process one or more tasks it should poll
`claimWork(provisionerId, workerType, {workerGroup, workerId, tasks})`, where
`tasks` is the number of tasks it is willing to process. This end-point is
long-polling and may take up to 20 seconds to return. The response contains a
list of _task claims_ for the worker to process. If it returns less than the
requested number of tasks, this is not an indication that further tasks aren't
available.

The tasks in the list of _task claims_ returned by `claimWork` is said to be
_claimed_ by the given worker. That is to say the worker current holds an
exclusive lock on the task and must refresh that lock using `reclaimTask` until
it has finished processing the task.

The _task claim_ structures returned by `claimWork`, contains the following:
 * A task status structure,
 * `runId` for the run that is held by this worker,
 * `takenUntil` time before which the task must be reclaimed,
 * The full `task` definition, and,
 * A set of temporary credentials for processing the tasks.

The temporary credentials is granted the `queue:claim-task:<taskId>/<runId>`
scope, as well as all scopes listed in `task.scopes`. These credentials are set
to expire shortly after `takenUntil`. The intend is that the worker should use
these credentials to:
 * Reclaim the task using `reclaimTask` which returns a new set of credentials
   replacing the ones that are about to expire,
 * Proxying requests on behalf of the task with `authorizedScopes = task.scopes`,
 * Upload artifacts, and,
 * Report the task _completed_, _failed_ or _exception_.

When `task.scopes` it communicates that the entity who created the task has the
given set of scopes and intended to let the task use these scopes. A worker can
use this to restrict a worker feature by requiring a scope to enable the feature.
This is often used to restrict access to worker caches, by requiring a
cache-specific scope, like `docker-worker:cache:<cacheName>` in `task.scopes`.

However, `task.scopes` can also be used to allow a task to access resources that
a worker wouldn't otherwise have access to. Because the temporary credentials
returns from `claimWork` and `reclaimTask` covers `task.scopes`. For example a
worker might offer an HTTP proxy that attaches a request signature to outgoing
requests. Then the task specific code can call APIs end-points authorized by
`task.scopes`, without the task specific code having access to any temporary
credentials that might otherwise be accidentally leaked in logs.

When proxying generic requests on behalf of a task, please remember to set
`authorizedScopes = task.scopes`. Otherwise, this mechanism could be used by the
task specific code to call APIs reserved for the worker, like `reportCompleted`.


## Reclaiming Tasks
When the worker has claimed a task, it's said to have a claim to a given
`taskId`/`runId`. This claim has an expiration, see the `takenUntil` property
in the response from `claimWork` and `reclaimTask`. A worker must call
`reclaimTask` before the claim denoted in `takenUntil` expires. It is
recommended that this attempted a few minutes prior to expiration, to allow
for clock drift and retries.

Just like the `claimWork` end-point, the `reclaimTask` response also contains
a set of temporary credentials intended to replace the previous credentials that
are set to expire shortly after `takenUntil`.

If a worker fails to `reclaimTask` the _run_ will be resolved _exception_, and
a new _pending_ run will be created if retries haven't be exhausted.

If an attempt to call `reclaimTask` returns `409`, then the given _run_ of the
task has likely been resolved. Perhaps the worker was too late to reclaim the
task, or it could have been canceled by a user. Either way, the worker should
halt execution, cleanup, and forget all about the task. There is no need to
attempt artifact upload or reporting the task result.


## Dealing with Invalid Payloads
The queue doesn't validate the `task.payload` property against any JSON schema,
hence, if the task payload is malformed or invalid, the worker may resolve the
current run by reporting an exception. When reporting an exception, using
`reportException` the worker should give a `reason`. If the worker is
unable execute the task specific payload/code/logic, it should report
exception with the reason `malformed-payload`. While reporting
`malformed-payload` helps identify that it is the task writer who is at fault,
it is still important to write a detailed explanation of what is wrong with the
task definition to the task log.

This can also be used if an external resource that is referenced in a
declarative nature doesn't exist. Generally, it should be used if we can be
certain that another run of the task will have the same result. This differs
from `queue.reportFailure` in the sense that we report a failure if the task
specific code failed.

Most tasks include a lot of declarative steps, such as poll a docker image,
create cache folder, decrypt encrypted environment variables, set environment
variables and etc. Clearly, if decryption of environment variables fail, there
is no reason to retry the task. Nor can it be said that the task failed,
because the error wasn't caused by execution of Turing complete code.

If however, we run some executable code referenced in `task.payload` and the
code crashes or exists non-zero, then the task is said to be failed. The
difference is whether or not the unexpected behavior happened before or after
the execution of task specific Turing complete code.


## Responding to Internal Errors
If the worker experiences an internal error it call `reportException` with the
reason `internal-error`. If the error is due to some temporarily missing
resource the reason `resources-unavailable` can also be used.

However, if the error can be attributed to a referenced resource that doesn't
exist, or an error in the task definition, the `malformed-payload` reason should
be used.

Regardless, of how what reason is used with `reportException` the worker can
still upload artifacts after reporting _exception_. This is not the case for
reporting _failed_ or _completed_. This is because workers that has experienced
an internal error are believed to be inherently unstable. So the workers should
first resolve the task as exception. Thus, a misbehaving worker can't resolve
it _completed_ by accident. Note. artifacts can't be added after 20 minutes or
so.

## Intermittent Tasks
To deal with intermittent tasks the worker can report _exception_ with the
reason `intermittent-task`. This is only supposed to be used by tasks that
explicitly communicate that they failed in an intermittent manner.
Generally, this should be **strongly discouraged**, but unfortunately necessary
in a few cases.

Reporting a task _exception_ with reason `intermittent-task` will retry the task
if retries haven't been exhausted. It is strongly encouraged that workers retry
the task/run it already holds, rather than resolving the task and have the queue
retry the task.

If using this feature, please ensure that task are explicitly asking to be
retried, due to intermittence, and consider if perhaps the intermittence is due
to a broken worker (dirty worker state or bad apple) and consider formatting
the worker, reporting `worker-shutdown` instead.


## Terminating the Worker Early
If the worker finds itself having to terminate early, for example a spot node
that detects pending termination. Or a physical machine ordered to be
provisioned for another purpose, the worker should report an exception with the
reason `worker-shutdown`. Upon such report the queue will resolve the run as
an exception and create a new run, if the task has additional retries left.


## Uploading Artifacts
To upload artifacts the worker should use the `createArtifact` API end-point.
Generally, workers should create S3 artifacts using
`createArtifact(taskId, runId, name, {storageType: 's3', expires, contentType})`
which returns a `putUrl`. The file is then uploaded to S3 by making a PUT
request to the `putUrl` with `content-length`, `content-type` and artifact data
as body.

The `createArtifact` calls must be signed with the most recent temporary
credentials returned from `claimWork` or `reclaimTask`. Artifacts can be
uploaded until `reportCompleted` or `reportFailed` is called. If the task is
resolved _exception_ with `reportException` then artifacts can be uploaded for
an additional 20 minutes. This is to ensure that _completed_ and _failed_ tasks
always have their artifact available, where as task resolved as _exception_
artifact upload is a best-effort service.


## Reporting Task Result
When the worker has completed the task successfully it should call
`queue.reportCompleted`. If the task is unsuccessful, ie. exits non-zero, the
worker should resolve it using `queue.reportFailed` (this implies test or
build failure). If a task is malformed, the input is invalid, configuration
is wrong, or the worker is told to shutdown by AWS before the the task is
completed, it should be reported to the queue using `queue.reportException`.
Notice that artifacts must be uploaded before the task is reported
_completed_ or _failed.
