---
title: Enable Notifications
---

# Enable Notifications

This service can also be used via a simple api, if you have the correct scopes.

There are (as of today) three types of notifications and four types of filters possible on these notifications.

### Notification Types

__IRC:__ This is only enabled on ``irc.mozilla.org`` for now. You can specify either a user or a channel to send a notification to upon task completion. You'll receive a message like the following: ``Task "Taskcluster Notify Test" complete with status 'completed'. Inspect: https://tc.example.com/tasks/f0rU3kS7RmG3xSWwbq6Ndw``.

__Email:__ We can you both nicely formatted or plain text emails depending on which email client you want to use. You can send to any email address, so long as you have the correct scopes (we'll discuss scopes later).

__Pulse:__ We can also send a Pulse message that is documented [on this page](/docs/reference/core/notify/exchanges). The message is  pretty much just the status of the task.

### Filters

__on-any:__ This does what it sounds like and will notify you of task-completion no matter how it ends. Unless the task was deliberately canceled.

__on-completed:__ Only when the task completes with no errors will you get a notification.

__on-failed:__ Only when the task fails for non-internal reasons will this be triggered. This could be your tests failing or a lint step failing, as examples.

__on-exception:__ This is triggered when the task didn't run due to some exception such as internal error, timeouts, deadlines, malformed-payload. Some exceptions can be ignored, using the `ignoreTaskReasonResolved` configuration parameter.  By default, this parameter contains `canceled` and `deadline-exceeded`.

More thorough (and more correct) documentation of task exception `reasonResolved` codes can be found [on the docs site](/docs/reference/platform/queue/api#status).

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

### Setting Custom Messages

In both irc and email you can set custom messages by adding fields to your task definition. The fields will be rendered with [jsone](https://taskcluster.github.io/json-e/)
given a context of the [task definition](/docs/reference/platform/queue/api#get-task-definition)
and the `status` section of [task status](/docs/reference/platform/queue/references/events#message-payload-4).
The task definition is in the context under the key `task` and the status is in the context under the key `status`.
The fields you add to your task definition are all in the `task.extra` section under a key `notify`. They are as follows:

__task.extra.notify.ircUserMessage:__ This should evaluate to a string and is the message sent to a user in irc if a `notify.irc-user` event occurs

__task.extra.notify.ircChannelMessage:__ This should evaluate to a string and is the message posted to a channel in irc if a `notify.irc-channel` event occurs

__task.extra.notify.email.content:__ This should evaluate to a markdown string and is the body of an email

__task.extra.notify.email.subject:__ This should evaluate to a normal string and is the subject of an email

__task.extra.notify.email.link:__ This should evaluate to an object with `text` (which will be the text on the button) and `href` keys or null if you don not want a link in your email

__task.extra.notify.email.template:__ This should evaluate to string with a value of either 'simple' or 'fullscreen' at this time


### Scopes

If you're using this from the api instead of via a task definition, you'll need some simple ``notify.<type>.*`` scopes of some sort. The specific ones you need are documented on the [api docs](/docs/reference/core/notify/api).

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
  name: "Taskcluster GitHub Tests"
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
      notify:
        email:
          content: 'Things worked in ${status.taskId}',
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
      name: "Taskcluster GitHub Tests"
      description: "All non-integration tests"
      owner: "{{ event.head.user.email }}"
      source: "{{ event.head.repo.url }}"
```
