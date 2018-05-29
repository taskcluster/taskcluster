---
title: Firing Hooks
order: 10
---

A hook can be "fired" in a variety of ways:

 * on a schedule
 * via the `triggerHook` API method
 * via a webhook, utilizing a security token

In each case, the hooks service creates a task based on the hook definition and
submits it to the Queue service via `Queue.createTask`.

If the task definition does not specify a `taskGroupId`, it is set the created
task's `taskId`.

## JSON-e Rendering

A hook definition's `task` property is, in fact, a
[JSON-e](https://taskcluster.github.io/json-e/) template.  When a hook is
fired, that template is rendered and the result is submitted to
`Queue.createTask`.

The context for that rendering is an object with property `firedBy`, giving the
action that led to the hook firing; as well as `taskId` giving the taskId (and
default `taskGroupId`) of the task being created. The other properties of the
object vary depending on the `firedBy` property.

### Scheduled Tasks

When a hook is fired at a scheduled time, the JSON-e context is simply:

```
{
    firedBy' 'schedule'
    taskId: 'IgfFQSAqQwysozyeB7udBw',
}
```

### TriggerHook

Calls to the `triggerHook` method include a payload. The payload is validated
against the hook's `triggerSchema`, and supplied in the JSON-e context as
`context`:

```
{
    firedBy: "triggerHook",
    taskId: 'IgfFQSAqQwysozyeB7udBw',
    payload: {..}               // API call payload
}
```

The schema validation also applies any default values specified in the schema.

### Webhooks

Webhooks are invoked with the `triggerHookWithToken` API method. This method is
designed to be easy to configure with other services like Github.  It requires
no authentication, but includes a secret token in the URL to prevent
unauthorized calls to the endpoint.

The context is similar to that for `triggerHook`:

```
{
    firedBy: "triggerHookWithToken",
    taskId: 'IgfFQSAqQwysozyeB7udBw',
    payload: {..}               // API call payload
}
```

## Task Times

The timestamps in the task are best set using JSON-e's `$fromNow` operator.
A feature of JSON-e is that all timestamps in a template are rendered from the
same base time, meaning that times will add up precisely.  Use something like

```
{
  task: {
    created: {$fromNow: '0 seconds'},
    deadline: {$fromNow: '1 day'},
    expires: {$fromNow: '1 month'},
  }
}
```

If the `created`, `deadline`, and `expires` attributes of the task are not set,
they will be filled with the default values of 0 seconds, 1 day, and 1 month.
However, this behavior is deprecated and you are encouraged to use `$fromNow`
instead.
