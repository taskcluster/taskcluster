---
filename: task-execution/workers.md
title: Workers
order: 20
---

Workers are the component responsible for actually executing tasks. Taskcluster
operates on the "pull" model, where workers pull tasks from queues as they have
available capacity.

Typically workers are implemented as daemons running on compute instances in
the cloud. As such, they have no REST API -- that is, there is no "worker
service".

## Worker Groups and Ids

Each individual worker is identified by a `<workerGroup>/<workerId>` pair,
identified in the task run information.  This information can be useful to
identify misbehaving workers by examining the runs of failed tasks.

You can drill down to a list of currently-running workers, arranged by
provisioner worker type, at https://tools.taskcluster.net/provisioners.

## Claiming Tasks

Workers signal their availability for new work by calling the Queue's
`claimWork` method. If there is a task available, this method returns its
details and records a "claim" of that task by the calling worker. The claim
lasts for a short time - a matter of minutes - and must be renewed
(`reclaimTask`) before it expires.  If a claim does expire, it implies the
Queue-worker communication has broken down, and so the Queue will resolve the
task run as exception / claim-expired, and schedule another task run so that
another worker may claim the task. This will happen up to a maximum number of
reclaims.

In most cases, multiple workers pull work from the same queue, so the worker
that executes a particular task is not known in advance.  In practice, this
does not matter, as all workers with the same `<provisionerId>/<workerType>`
are typically configured identically, or at least so similar that it will not
matter which worker executes a particular task. For example, it is common to
use a variety of similar AWS instance types for a single worker type, allowing
the AWS provisioner to select the most cost-effective option based on current
spot prices.

As mentioned previously, the format of the task payload depends on the worker
executing the task. It is up to the task author to know the payload format a
particular worker, as identified by its worker type, will expect.

## Bring Your Own Worker

Workers communicate with the Queue API using normal Taskcluster API calling
conventions. It is quite practical (and fun!) to run purpose-specific workers
with a configuration appropriate to that purpose.

Those workers may run one of the worker implementations developed by the
Taskcluster team, or an entirely purpose-specific implementation that uses the
same APIs. For example, [scriptworker](http://scriptworker.readthedocs.io/) was
developed by release engineering to run release-related scripts in a limited,
secure context.

The Taskcluster-provided worker implementations, including their payload
formats, are described in the [workers reference](/docs/reference/workers).

The protocol for interacting with the Queue service is described in
[Queue-Worker
Interaction](/docs/reference/platform/taskcluster-queue/docs/worker-interaction).

## Worker Scopes

The Queue APIs used by workers require Taskcluster credentials specific to the
worker type and ID. This prevents a worker from claiming tasks from other
worker types or from misrepresenting its identity.

When a worker claims a task, it gets a set of temporary credentials based on
the task's `scopes` property.
