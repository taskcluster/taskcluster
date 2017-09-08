---
title: Superseding
---

In many cases, executing some tasks in the queue can render others unnecessary.
For example, if the test tasks for a later version-control revision succeed, then tests for earlier revisions can be skipped.
Such earlier tasks are said to be "superseded" by the later task.

The queue supports superseding by implementing a `superseded` reason for task resolution (seen with state `exception`).
The rest is up to the worker.

## Convention

General-purpose workers that support superseding are encouraged to follow this convention, allowing users of those workers to use common code to generate superseding configuratoin.
Note that not all workers support this convention, and that some special-purpose workers may implement something completely different.
As of this writing, docker-worker and generic-worker implement this convention.

The worker can supersede multiple tasks, executing only one (the "primary task").
Crucially, the primary task need not be the same task that the worker found on the queue, but may be one deeper into the queue (e.g., a change pushed to version control later).

Workers implement superseding with the help of a superseder service, specified in the task payload as `supersederUrl`:

Example:

```js
{
    "supersederUrl": "https://foo-coalescer.herokuapp.com/build/linux/master"
}
```

The worker appends the `taskid` of the task it has received from the queue (the "initial taskId") as a query argument, `?taskId=<taskId>`.
The service is free to interpret the URL path in any way.

The supserseder returns a list of `taskid`s, including the initial `taskid`, in the `supersedes` property of the response body.
The list is sorted such that each task supersedes all tasks appearing earlier in the list.
The worker will attempt to claim each task, and execute the highest-indexed task for which `claimTask` succeeds -- this task becomes the primary task.

Continuing the example, given an initial `taskid` of `E5SBRfo-RfOIxh0V4187Qg`, the foo-coalescer service might respond with

```js
{
    "supersedes": [
        "E5SBRfo-RfOIxh0V4187Qg",
        "909mRog1E98Va0g-bb91ba",
        "KGt8egfvRaqxczIRgOScaw"
    ]
}
```

This indicates that, for this coalescing key, the best task to execute is `KGt8egfvRaqxczIRgOScaw`, superseding `909mRog1E98Va0g-bb91ba` and `E5SBRfo-RfOIxh0V4187Qg`.
The worker would try to claim all three tasks.
If the claims succeeded for all but the last task, then it would consider `909mRog1E98Va0g-bb91ba` the primary task and execute it.
Note that this is not the same task that it received from the queue!

When the primary task completes, all of the secondary tasks are resolved as exception/superseded, with an artifact named `public/superseded-by.json` containing the `taskId` and `runId` of the primary task.
The primary task gets an artifact named `public/supersedes.json` with a list of `{taskId, runId}` for the tasks it supersedes.
