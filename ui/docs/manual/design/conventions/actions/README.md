---
title: Action Tasks
---

This section defines the Taskcluster convention for *actions*.
Actions allow users to affect a task or task-graph after it has been submitted.

Actions are defined by a decision task, so they can be defined and modified in the source tree in a typical CI configuration, using the usual review processes.

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

Actions are supported by the Taskcluster UI, including default implementations of some common actions.

See the [specification](/docs/manual/design/conventions/actions/spec) for more detail.
