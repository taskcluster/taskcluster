---
title: Gecko and Taskcluster
followup:
  links:
    gecko-decision-task: How is the decision task defined?
    gecko-task-graph: How is the task-graph generated?
    gecko-docker-images: How are the docker images created?
---

When a developer pushes to a Gecko repository, a long chain of events begins:

 * A "decision task" is created to decide what to do with the push.
 * The decision task creates a lot of additional tasks.
   These tasks include build and test tasks, along with lots of other kinds of tasks to build docker images, build toolchains, perform analyses, check syntax, and so on.
 * These tasks are arranged in a "task graph", with some tasks (e.g., tests) depending on others (builds).
   Once its prerequisite tasks complete, a dependent task begins.
 * The result of each task is sent to [TreeHerder](https://treeherder.mozilla.org) where developers and sheriffs can track the status of the push.
 * The outputs from each task -- log files, Firefox installers, and so on -- appear attached to each task (viewable in the [Task Inspector](https://tc.example.com/tasks)) when it completes.

Due to its "self-service" design, very little of this process is actually part of Taskcluster, so we provide only a brief overview and some pointers.

Taskcluster provides a small bit of glue ([mozilla-taskcluster](/docs/manual/vcs/mozilla-taskcluster)) to create the decision task and some more ([taskcluster-treeherder](/docs/reference/core/treeherder)) to communicate with treeherder, but the task graph itself is defined entirely in-tree.
