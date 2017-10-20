---
title: Actions
description: How actions are defined on the provisioner.
---

Actions can be performed on provisioners, worker-types and workers. An example of an action
can be to kill all instances of a workerType. Each action has a `context` that is one of
`provisioner`, `worker-type`, or `worker`, indicating which it applies to. For example,
an action to kill a worker will have a `context=worker` since it's operating on the worker level.

## Defining Actions
To add an action to a provisioner, perform a call to the queue's `declareProvisioner` method,
supplying a list of actions.

An action is comprised with the following properties:

| Property      | Type                                         | Required? | Description                                                                                                                                                                                                                                         |
|---------------|----------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`        | string                                       | ✓         | Used by user interfaces to identify the action. For example, a retrigger button might look for an action with name = "retrigger".                                                                                                                   |
| `title`       | string                                       | ✓         | A human readable string intended to be used as label on the button, link or menu entry that triggers the action. This should be short and concise. Ideally, you'll want to avoid duplicates.                                                        |
| `context`     | enum('provisioner', 'worker-type', 'worker') | ✓         | Actions have a "context" that is one of provisioner, worker-type, or worker, indicating which it applies to. `context` is used to construct the query string of the `POST` request.                                                                 |
| `url`         | string                                       | ✓         | Path name to use for the `POST` request                                                                                                                                                                                                             |
| `description` | string                                       | ✓         | A human readable string describing the action, such as what it does, how it does it, what it is useful for. This string is to be render as markdown, allowing for bullet points, links and other simple formatting to explain what the action does. |


### Context
Actions have a "context" that is one of `provisioner`, `worker-type`, or `worker`, indicating which it applies to. `context`
is used to construct the query string of the `POST` request.

| `context`     | query string                                                     |
|---------------|------------------------------------------------------------------|
| `provisioner` | `?provisionerId=...`                                             |
| `worker-type` | `?provisionerId=...&workerType=...`                              |
| `worker`      | `?provisionerId=...&workerType=...&workerGroup=...&workerId=...` |

## How to trigger an action
To trigger an action, make a `POST` request to a URL constructed from the url field with query
arguments added based on the `context`.
  
_Example:_

For the following action:
```
{
    name: 'kill',
    title: 'Kill WorkerType',
    context: 'worker-type',
    url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle',
    description: 'Remove worker-type',
}
```

The `POST` request will be:

```
https://hardware-provisioner.mozilla-releng.net/v1/power-cycle?provisionerId=${PROVISIONER_ID}&workerType=${WORKER_TYPE}
```

_Note: The `POST` request is made with Taskcluster credentials._
