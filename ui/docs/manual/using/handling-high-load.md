---
title: Handling High Load
---

# Handling High Load

When worker capacity is constrained, such as in a fixed pool of hardware, the
demand for work can outstrip available capacity.  When this occurs, Taskcluster
provides a few tools that can help.

## Priorities

Task [priorities](/docs/manual/tasks/priority) are useful to ensure that the most
important tasks are executed first.  When the capacity issues are transient,
this can be helpful.  However, it can cause starvation of lower-priority tasks
if higher-priority tasks consume all of the limited resources.

## Deadlines

Sometimes tasks are not useful after a given time has passed. For example, the
results of a test run are probably not useful more than 12 hours after the
push.  Setting appropriate task [deadlines](/docs/manual/tasks/times) can help to
remove such useless tasks from the backlog if they are not executed earlier.

## Superseding

In truth, most often tasks become less useful when some later task would
provide equivalent results.  For example, a test on revision 76 provides useful
results about revision 75 as well: if it passes, then likely the changes in
revisions 76 and 75 were both OK. In Taskcluster terms, the task for revision
76 has superseded that for revision 75.

Most workers support superseding.  It is implemented by calling out to an
external service that determines the "supersedes" relationship between tasks.
When superseding is possible, the worker marks older tasks as "supserseded"
while performing the newest task.

See the [queue
reference](/docs/reference/platform/queue/superseding) for the
technical details of the supserseding convention.
