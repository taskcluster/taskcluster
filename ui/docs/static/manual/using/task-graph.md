---
filename: using/task-graph.md
title: Building Task Graphs
order: 50
---

Useful work often requires more than one task. For example, new source code
might be built on several platforms, or slow tests might be split up to run in
parallel.

Taskcluster's developers and users have established a convention for
accomplishing this, called a "decision task". This is a single task which runs
first, and creates all of the required tasks directly by calling the
`queue.createTask` endpoint.

This has a number of advantages over other options:

 * The set of tasks to run can be specified in the same source tree as the code
   being built, allowing unlimited flexibility in what runs and how.
 * Several event sources can all create similar decision tasks. For example, a
   push, a new pull request, and a "nightly build" hook can all create decision
   tasks with only slightly different parameters, avoiding repetition of complex
   task-definition logic in all of the related services.

The disadvantage being Taskcluster does not provide an easy way to design decision
tasks. The Gecko (Firefox) project has a sophisticated implementation, but it
is not designed to be used outside of the Gecko source tree. Other projects
are left to implement decision tasks on their own.

We on the Taskcluster team would like to remedy this shortcoming, but it is not
an active project.  Contributors are welcome!

## Conventions

We have established a few conventions about decision tasks. These are based on
our experience with Gecko, and will help avoid some pitfalls we encountered.
They will also ensure that your decision tasks are compatible with any later
formalisms we may add around decision tasks.

 * A decision task is the first task in a task group, and that task group's
   `taskGroupId` is identical to its `taskId`. As a corollary, it is easy to
   find the decision task for a subtask: simply treat its `taskGroupId` as a
   `taskId`.

 * Decision tasks call `queue.createTask` using the Taskcluster-Proxy feature,
   meaning that no Taskcluster credentials are required, and the scopes
   available for the `createTask` call are those afforded to the decision task
   itself.

 * A decision task runs with all of the scopes that any task it creates might
   need. It calculates precisely the scopes each subtask requires, and supplies
   those to the `queue.createTask` call.

 * All subtasks depend on the decision task. This ensures that, if the decision
   task crashes after having created only some of the subtasks, none of those
   tasks run and the decision task can simply be re-triggered.