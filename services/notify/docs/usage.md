---
layout: post
title: Announcing Taskcluster Notifications
---

One of the most requested features for Taskcluster has been a way to be notified on task completion rather than checking back in on the task-inspector tab every few minutes. As of today, taskcluster-notify makes that easy to do. If you have any experience indexing artifacts with routes in a task definition, you're already familiar with the mechanism for adding notifications to your tasks. If not, it's quite easy to figure out!

This service can also be used via a simple api, if you have the correct scopes.

There are (as of today) three types of notifications and four types of filters possible on these notifications.

### Notification Types

__IRC:__ This is only enabled on ``irc.mozilla.org`` for now. You can specify either a user or a channel to send a notification to upon task completion. You'll receive a message like the following: ``Task "Taskcluster Notify Test" complete with status 'completed'. Inspect: https://tools.taskcluster.net/task-inspector/#f0rU3kS7RmG3xSWwbq6Ndw``.

__Email:__ We can you both nicely formatted or plain text emails depending on which email client you want to use. You can send to any email address, so long as you have the correct scopes (we'll discuss scopes later).

__Pulse:__ We can also send a Pulse message that is documented [on this page](https://docs.taskcluster.net/reference/core/notify/exchanges). The message is  pretty much just the status of the task.

### Filters

__on-any:__ This does what it sounds like and will notify you of task-completion no matter how it ends.

__on-success:__ Only when the task completes with no errors will you get a notification.

__on-failed:__ Only when the task fails for non-internal reasons will this be triggered. This could be your tests failing or a lint step failing, as examples.

__on-exception:__ This is triggered when some sort of internal issue happens in Taskcluster and we had to cancel the task.

More thorough (and more correct) documentation of what task statuses are can be found [on the docs site](https://docs.taskcluster.net/reference/platform/queue/api-docs#status).

### Route Syntax

But what you've really been waiting for is to know how to use this, so here's a simple set of routes that will do some of the things you might want.

```json
{
  "routes": [
    "notify.email.<you@you.com>.on-any",
    "notify.irc-user.<your-mozilla-irc-nick>.on-failed",
    "notify.irc-channel.<a-mozilla-irc-channel>.on-completed",
    "notify.pulse.<a-pulse-routing-key>.on-exception"
  ]
}
```

### Scopes

If you're using this from the api instead of via a task definition, you'll need some simple ``notify.<type>.*`` scopes of some sort. The specific ones you need are documented on the [api docs](https://docs.taskcluster.net/reference/core/notify/api-docs).

If you're using this via task definitions, access to notifications is guarded with route scopes. As an example, to allow the taskcluster-github project to email and ping in irc when builds complete, it has the scopes

```
queue:route:notify.email.*
queue:route:notify.irc-channel.*
queue:route:notify.irc-user.*
```

### Example

Finally, an example to tie it all together. This is the as-of-this-writing ``.taskcluster.yml`` of the aforementioned taskcluster-github project.


```yaml
version: 0
metadata:
  name: "TaskCluster GitHub Tests"
  description: "All non-integration tests for taskcluster github"
  owner: "{{ event.head.user.email }}"
  source: "{{ event.head.repo.url }}"
tasks:
  - provisionerId: "{{ taskcluster.docker.provisionerId }}"
    workerType: "{{ taskcluster.docker.workerType }}"
    routes:
      - "notify.email.{{event.head.user.email}}.on-any"
      - "notify.irc-channel.#taskcluster-notifications.on-failed"
      - "notify.irc-channel.#taskcluster-notifications.on-exception"
    extra:
      github:
        env: true
        events:
          - pull_request.opened
          - pull_request.synchronize
          - pull_request.reopened
          - push
    payload:
      maxRunTime: 3600
      image: "node:5"
      command:
        - "/bin/bash"
        - "-lc"
        - "git clone {{event.head.repo.url}} repo && cd repo && git checkout {{event.head.sha}} && npm install . && npm test"
    metadata:
      name: "TaskCluster GitHub Tests"
      description: "All non-integration tests"
      owner: "{{ event.head.user.email }}"
      source: "{{ event.head.repo.url }}"
```


### Next Steps

We're working now to enable this to be triggered not only on tasks but also task-groups. Work is ongoing with that project. If you have any questions or suggestions, say hi in the ``#taskcluster`` channel on Mozilla irc.
