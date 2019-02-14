---
title: Defining User Actions on Existing Tasks
---

This section shows how to define *actions*. Actions allow users to affect a
task or task-graph after it has been submitted. Common actions are:

-   Retrigger a task,
-   Retry specific test cases many times,
-   Obtain a loaner machine,
-   Backfill missing tasks,

Actions are defined in-tree, so they are specific to the software being built
and can be modified through the usual review process.  Taskcluster defines a
convention -- documented here -- which allows user interfaces to connect users
to these actions.

At a very high level, the process looks like this:

-   A decision task produces an artifact, `public/actions.json`,
    indicating what actions are available.
-   A user interface (for example, Treeherder or the Taskcluster
    tools) consults `actions.json` and presents appropriate choices to
    the user, if necessary gathering additional data from the user,
    such as the number of times to re-trigger a test case.
-   The user interface follows the action description to carry out the
    action. In most cases (`action.kind == 'task'`), that entails
    creating an "action task", including the provided information.
    That action task is responsible for carrying out the named action,
    and may create new sub-tasks if necessary (for example, to
    re-trigger a task).

For Gecko developers, there is [documentation](https://firefox-source-docs.mozilla.org/taskcluster/taskcluster/action-implementation.html) on how to write action tasks in-tree.
