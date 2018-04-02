# Taskcluster Web Server

A web server for supporting the taskcluster-web UI repository. Serves as a
GraphQL gateway to the Taskcluster REST APIs, and should eventually support and
improve user preferences and authentication flows.
Helps make Taskcluster API communication consistent and offloads client refreshing
to the gateway instead of putting extra logic on the web consumer.

Supports the queries, mutations, and subscriptions of Taskcluster APIs used
by the web application.

## Environment variables

To launch this service, either set the following environment variables or
place a `.env` file in the root of this repo with the following environment variables
inside of it:

```sh
# Network port to bind the service to:
PORT="3050"

# The issuer used when provided JWTs. Use the following by default:
JWT_ISSUER="https://auth.mozilla.auth0.com/"

# The service used to verify JWTs. Use the following by default:
JWKS_URI="https://auth.mozilla.auth0.com/.well-known/jwks.json"

# The Login service to get a Taskcluster API token from JWT (auth0) credentials.
# Use the following by default:
LOGIN_URL="https://login.taskcluster.net/v1/oidc-credentials/mozilla-auth0"

# Username for connecting to pulse for subscriptions:
PULSE_USERNAME="<insert username here>"

# Password for connecting to pulse for subscriptions:
PULSE_PASSWORD="<insert password here>"
```

## Launching locally

To start the service up locally, be sure to set the above environment variables.
Then install dependencies using `yarn`. Use the command `yarn start` to start the
service, which launches on the `PORT` set in `.env`.

You should see the following message in the console, for example, using port 3050:

```bash
Web server running on port 3050.

Open the interactive GraphQL Playground, schema explorer and docs in your browser at:
    http://localhost:3050
```

To pass credentials to the server from the GraphQL Playground, click the "HTTP Headers"
section, and paste a JSON object with a key of "Authorization" with a value of
"Bearer YOUR_ACCESS_TOKEN", such as:

```json
{
  "Authorization": "Bearer eyJ0...yXlBw"
}
```

<img src="https://cldup.com/XDpBc-qY5Q.png" alt="authorization header" height="75%" width="75%" />

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
  tasks(taskGroupId: "AMfy-mopRaOCQlNW5IhOeQ") {
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
    "provisionerId": "aws-provisioner-v1",
    "workerType": "tutorial",
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
