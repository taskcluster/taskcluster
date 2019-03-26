# Hooks Service

This service creates tasks in response to events.
This includes:

 * Creating tasks at specific times (like "cron")
 * Creating tasks in response to API calls
 * Creating tasks in response to webhooks, supporting integration with external systems
 * Creating tasks in response to Pulse messages

## Hooks

Hooks are identified with a `hookGroupId` and a `hookId`.

When an event occurs, the resulting task is automatically created.
The task is created using the scope `assume:hook-id:<hookGroupId>/<hookId>`, which must have scopes to make the `queue.createTask` call, including satisfying all scopes in `task.scopes`.
By default, the new task has a `taskGroupId` equal to its `taskId`, as is the convention for decision tasks.

### Trigger Schema

When a hook is triggered by an API call or a webhook, the user-provided payload is validated against the hook's `triggerSchema`, and the call rejected if validation fails.
This provides a reliable way of limiting allowed inputs and ensuring that incorrect inputs do not cause unexpected behavior.

### Schedule

Hooks can have a "schedule" indicating specific times that new tasks should be created.
Each schedule is in a simple cron format, per https://www.npmjs.com/package/cron-parser.
For example:
 * `['0 0 1 * * *']` -- daily at 1:00 UTC
 * `['0 0 9,21 * * 1-5', '0 0 12 * * 0,6']` -- weekdays at 9:00 and 21:00 UTC, weekends at noon

### Pulse Bindings

Hooks have a `bindings` property that gives a list of exchanges and routing-key patterns.
The hooks service binds queues accordingly, and triggers a hook for each message received, with the message body as its payload.

### JSON-e

The task template at `hook.task` is treated as a JSON-e template, with a context depending on how it is fired.
See [firing-hooks](/docs/reference/core/hooks/firing-hooks) for more information.

## Trigger Payloads and Privilege Escalation

Several of the event types support a trigger payload, which is validated against a schema and combined with the task template.
This allows controlled parameterization of the resulting tasks.

Hooks run with scopes defined by a role, and those scopes can exceed those available to the caller of an API method, for example.

Taken together, these properties allow design of controlled privilege-escalation mechanisms (similar to `sudo`).
For example, a hook named `release/ship-release` could create a task to ship a release to users, given a version number.
The permissions to push to the repository hosting the release binary are available to the hook, but need not be available to the developer calling `triggerHook`, who can only specify a version.
Similarly, access to that `triggerHook` call is controlled by scopes and can be limited to only authorized developers.
