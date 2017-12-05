---
title: Actions
description: Queue Actions
order: 40
---

The queue allows users to define "actions" on [provisioner, worker type, and
worker](worker-hierarchy) resources. These actions can then be executed by
other components for their side-effects on the resources.  An example of an
action can be to kill all instances of a workerType.

Each action has a `context` that is one of `provisioner`, `worker-type`, or
`worker`, indicating which it applies to. For example, an action to kill a
worker will have a `context=worker` since it's operating on the worker level.
An action to reboot a single worker would have `context=worker`.

Queue Actions are conceptually related to [task
actions](/manual/using/actions), in that both allow resources to expose
context-specific opportunities to manipulate those resources.  However, the
implementations are completely different.

## Defining Actions

Actions are defined at the provisioner level. To set the actions to a
provisioner, perform a call to the queue's
[declareProvisioner](/reference/platform/taskcluster-queue/references/api#declareProvisioner)
method, supplying a list of actions.

An action is comprised with the following properties:

| Property      | Type                                          | Required? | Description                                                                                                                                                                                                                                         |
|---------------|-----------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`        | string                                        | ✓         | Used by user interfaces to identify the action. For example, a retrigger button might look for an action with name = "retrigger".                                                                                                                   |
| `title`       | string                                        | ✓         | A human readable string intended to be used as label on the button, link or menu entry that triggers the action. This should be short and concise. Ideally, you'll want to avoid duplicates.                                                        |
| `context`     | enum('provisioner', 'worker-type', 'worker')  | ✓         | Actions have a "context" that is one of `provisioner`, `worker-type`, or `worker`, indicating which it applies to.                                                                                                                                  |
| `url`         | string                                        | ✓         | URL to use for the request.                                                                                                                                                                                                                         |
| `method`      | enum('POST', 'PUT', 'DELETE', 'PATCH')        | ✓         | HTTP Method to use for the request.                                                                                                                                                                                                                 |
| `description` | string                                        | ✓         | A human readable string describing the action, such as what it does, how it does it, what it is useful for. This string is to be render as markdown, allowing for bullet points, links and other simple formatting to explain what the action does. |


Note that the action endpoint should return early. In other words, if an action takes a while
to finish, start it up and send the HTTP response. To notify a user with the action status,
use [taskcluster-notify](https://docs.taskcluster.net/reference/core/taskcluster-notify).


### Context

Actions have a "context" that is one of `provisioner`, `worker-type`, or `worker`, indicating which it applies to.  Actions
specific to a context will only be returned by the appropriate API method.

| `context`     | API Method                                                                             |
|---------------|----------------------------------------------------------------------------------------|
| `provisioner` | [getProvisioner](/reference/platform/taskcluster-queue/references/api#getProvisioner)* |
| `worker-type` | [getWorkerType](/reference/platform/taskcluster-queue/references/api#getWorkerType)    |
| `worker`      | [getWorker](/reference/platform/taskcluster-queue/references/api#getWorker)            |

Note that all actions are declared at the provisioner level, regardless of
context.  For symmetry, `getProvisioner` also returns all actions, not just
those with `context=provisioner`.

## Triggering Actions in a User Interface

To trigger an action, use the action's `url` and `method` properties to make a request to it.
Depending on the action's `context`, substitute the following parameters in the `url`:

| `context`   | Path parameters                                                  |
|-------------|------------------------------------------------------------------|
| provisioner | `<provisionerId>`                                                |
| worker-type | `<provisionerId>`, `<workerType>`                                |
| worker      | `<provisionerId>`, `<workerType>`, `<workerGroup>`, `<workerId>` |

If the action is initiated by a user, it should have the user's Taskcluster
credentials attached.

_Example:_

For the following action:
```
{
    name: 'kill',
    title: 'Kill',
    context: 'worker',
    url: 'https://ec2-manager.taskcluster.net/v1/region/<workerGroup>/instance/<workerId>',
    method: 'DELETE',
    description: 'Terminate an EC2 instance.',
}
```

The `DELETE` request will be:

```
https://ec2-manager.taskcluster.net/v1/region/${workerGroup}/instance/${workerId}
```
## Triggering Actions in Automation

An automated system that needs to trigger an action should call the appropriate
API method (e.g., `getWorkerType`) to find the available actions, and then
search for the desired action by exact match against the `name` property. This
allows modification of an action's title without breaking existing automation.

Having found the action, follow the same process as above for generating the
URL and method. A service will generally use its own permanent Taskcluster
credentials to make the HTTP request.
