---
title: Superseding
order: 50
---

In some cases, the demand for tasks outstrips the available resources to run those tasks, and pending counts on queues start to grow.
In many cases, executing some tasks in the queue can render others unnecessary.
For example, if the test tasks for a later version-control revision succeed, then tests for earlier revisions can be skipped.
Such earlier tasks are said to be "superseded" by the later task.

Docker-worker supports superseding multiple tasks, executing only one (the "primary task").
Crucially, the primary task need not be the same task that the worker found on the queue, but may be one deeper into the queue (e.g., a change pushed to version control later).
It does so with the help of a superseder service, specified in the task payload as `supersederUrl`:

Example:

```js
{
    "supersederUrl": "https://foo-coalescer.herokuapp.com/build/linux/master"
}
```

The docker-worker will append the taskId of the task it has received from the queue (the "initial taskId") as a query argument, `?taskId=<taskId>`.
The service is free to interpret the URL path in any way.

The supserseder returns a list of taskIds, including the initial taskId, in the `supersedes` property of the response body.
The list is sorted such that each task supersedes all tasks appearing later in the list.
The worker will attempt to claim each task, and execute the lowest-indexed task for which `claimTask` succeeds -- this task becomes the primary task.

Continuing the example, given an initial taskId of `E5SBRfo-RfOIxh0V4187Qg`, the foo-coalescer service might respond with

```js
{
    "supersedes": [
        "KGt8egfvRaqxczIRgOScaw",
        "909mRog1E98Va0g-bb91ba",
        "E5SBRfo-RfOIxh0V4187Qg"
    ]
}
```

This indicates that, for this coalescing key, the best task to execute is `KGt8egfvRaqxczIRgOScaw`, superseding `909mRog1E98Va0g-bb91ba` and `E5SBRfo-RfOIxh0V4187Qg`.
The worker would try to claim all three tasks.
If the claims succeeded for all but the first task, then it would consider `909mRog1E98Va0g-bb91ba` the primary task and execute it.
Note that this is not the same task that it received from the queue!

When the primary task completes, all of the secondary tasks are resolved as exception/superseded, with an artifact named `public/superseded-by.json` containing the `taskId` and `runId` of the primary task.
The primary task gets an artifact named `public/supersedes.json` with a list of `{taskId, runId}` for the tasks it supersedes.
