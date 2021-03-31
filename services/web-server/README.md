# Web-Server Service

A web server for supporting the taskcluster-ui repository.
This service acts as a GraphQL gateway to the Taskcluster REST APIs, and supports user authentication flows.

It supports the queries, mutations, and subscriptions of Taskcluster APIs used by the web application.

## Configuration

Configuration is done via [taskcluster-lib-config](../../libraries/config) like all
other Taskcluster services. The main configuration file is `config.yml`, and
that refers to environment variables.  In production, those environment
variables are provided as part of the deployment.  During development,
configuration can be overridden in `user-config.yml`.

## Running Taskcluster-Web-Server locally

See `dev-docs/development-process.md` in this repository for guidance on developing Taskcluster.

## Passing Credentials in the Playground

_NOTE:_ in most cases, this is not necessary.

To pass credentials to the server from the GraphQL Playground, first sign in to the site locally, using static credentials.
Then load another page, and use the Firefox DevTools to find the "Authorization" header in the resulting `graphql` request.

In the playground, click the "HTTP Headers"
section, and paste a JSON object with a key of "Authorization" with a value of
"Bearer YOUR_TC_TOKEN", such as:

```json
{
  "Authorization": "Bearer eyJ0...yXlBw"
}
```

<img src="https://cldup.com/XDpBc-qY5Q.png" alt="authorization header" height="75%" width="75%" />

## Login Strategies

Taskcluster supports a number of "login strategies" to support users logging into the UI.
See [`docs/login-strategies.md`](./docs/login-strategies.md) for more information.
Note that in most cases setup of login strategies is not required for development of this service.

## Sample Queries

Query a task, selecting status state and name:

```graphql
query Sample {
  task(taskId: "XeC1Y4NjQp25SbK0o8ab7w") {
    status {
      state
    }
    
    metadata {
      name
    }
  }
}
```

Select the taskId for all tasks in a task group,
and select whether there is another page:

```graphql
query Sample {
  taskGroup(taskGroupId: "AMfy-mopRaOCQlNW5IhOeQ") {
    pageInfo {
      hasNextPage
    }

    edges {
      node {
        taskId
      }
    }
  }
}
```

## Sample mutations

Create a tutorial task:

```graphql
mutation Sample($taskId: ID!, $task: TaskInput!) {
  createTask(taskId: $taskId, task: $task) {
    state
  }
}
```

Variables:

```json
{
  "taskId": "fN1SbArXTPSVFNUvaOlinQ",
  "task": {
    "provisionerId": "test-provisioner",
    "workerType": "highcpu",
    "retries": 0,
    "created": "2018-03-07T05:53:06.683Z",
    "deadline": "2018-03-07T06:03:06.683Z",
    "expires": "2019-03-07T06:03:06.683Z",
    "payload": {
      "image": "ubuntu:13.10",
      "command": [
        "/bin/bash",
        "-c",
        "for ((i=1;i<=600;i++)); do echo $i; sleep 1; done"
      ],
      "maxRunTime": 600
    },
    "metadata": {
      "name": "GraphQL Tutorial Task",
      "description": "Task created via GraphQL",
      "owner": "eli@eliperelman.com",
      "source": "https://localhost:3050/"
    }
  }
}
```

## Sample subscriptions

Subscribe to the tasks entering the `PENDING` state within a task group,
selecting its state:

```graphql
subscription Sample {
  tasksPending(taskGroupId: "fN1SbArXTPSVFNUvaOlinQ") {
    status {
      state
    }
  }
}
```

Subscribe to multiple task group subscriptions, selecting the state
from each status change:

```graphql
subscription Sample($taskGroupId: ID!, $subscriptions: [TaskSubscriptions]!) {
  tasksSubscriptions(taskGroupId: $taskGroupId, subscriptions: $subscriptions) {
    ...on TaskFailed {
      status {
        state
      }
    }
    ...on TaskException {
      status {
        state
      }
    }
    ...on TaskCompleted {
      status {
        state
      }
    }
  }
}
```

Variables:

```json
{
  "taskGroupId": "fN1SbArXTPSVFNUvaOlinQ",
  "subscriptions": [
    "tasksException",
    "tasksFailed",
    "tasksCompleted"
  ]
}
```

## Data Flow Diagram

![data flow](https://cldup.com/e3lrkf28ab.png)
