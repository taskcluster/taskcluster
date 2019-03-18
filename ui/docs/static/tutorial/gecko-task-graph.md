---
title: Gecko Task Graph Creation
followup:
  links:
    gecko-new-job: I want to add a new job
    gecko-task-graph-howto: I want to change something else
---

# Gecko Task Graph Creation

The decision task is responsible for creating the "task graph".
This is the collection of all tasks required in response to the push, connected by dependencies.
For example, a test task will depend on the build task producing the browser installer it should test.

Task-graph generation occurs entirely "in-tree", in the sense that both the configuration and code are contained in the Gecko source tree.
This means that it can evolve along with Gecko, and in fact may work differently on different branches!

The task-graph generation process is well-documented in the [Gecko Documentation](https://firefox-source-docs.mozilla.org/taskcluster/taskcluster/index.html).

---

## Try Pushes

Try pushes are handled the same way.
The in-tree task-graph generation code parses the try commit message and uses the result to determine which tasks, out of the full task graph that might be run on an integration branch, should be performed for the try push.
This means that you can easily [add entirely new tasks](gecko-new-job) (a new test suite, a new platform, etc.) to the tree and test them with a try push.
