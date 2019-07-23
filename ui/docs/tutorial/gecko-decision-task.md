---
title: Gecko Decision Task
followup:
  links:
    gecko-task-graph: How is the task-graph generated?
---

Upon detecting a push to a supported Mercurial repository, Taskcluster reads [`.taskcluster.yml`](https://dxr.mozilla.org/mozilla-central/source/.taskcluster.yml) from the root directory of the repository, in the revision just pushed.
It parses this file, substituting a number of variables based on the push, and submits the resulting task to the [Taskcluster queue](/docs/manual/tasks/queue).
This task is the "decision task", which will in turn create all of the tasks for the push.

The scopes available to the decision task are limited by the repository's role.
For example, the Cypress branch's decision task has only the scopes in [repo:hg.mozilla.org/projects/cypress:*](https://tc.example.com/auth/roles/#repo:hg.mozilla.org%252fprojects%252fcypress:*).

This pattern occurs even for a try push.
That means you can modify how the decision task is invoked, or even what the decision task does, in a try push!

You can find a link to the latest mozilla-central decision task in [the Taskcluster index](https://tc.example.com/index/#gecko.v2.mozilla-central.latest.firefox/gecko.v2.mozilla-central.latest.firefox.decision).
