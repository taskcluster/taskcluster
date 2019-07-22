---
title: Finding Tasks
---

# Finding Tasks

The "table of contents" for Taskcluster tasks is the
[Index](https://tc.example.com/tasks/index). When a task completes
successfully, it is added to the index at an "index route" given by any
`task.routes` entries that begin with `index.`. (Actually, the Queue just
[sends pulse messages to well-known exchanges](/docs/reference/platform/queue/exchanges).
The Index listens to `index.*` for task completion, and indexes the tasks appropriately).

What that means is, you can use the [Index Browser](https://tc.example.com/tasks/index)
to find tasks.  The precise format of the index paths is partially defined in the
[namespaces](/docs/manual/devel/namespaces) document.

---

## Gecko Hacker?

If you're looking for Gecko tasks, or tasks for another project that reports to
TreeHerder, you can use TreeHerder to find tasks.  Click on the job in
treeherder, then click "Inspect Task".
