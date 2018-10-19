# Taskcluster Web Server

A web server for supporting the taskcluster-web UI repository. Serves as a
GraphQL gateway to the Taskcluster REST APIs, and should eventually support and
improve user preferences and authentication flows.
Helps make Taskcluster API communication consistent and offloads client refreshing
to the gateway instead of putting extra logic on the web consumer.

Supports the queries, mutations, and subscriptions of Taskcluster APIs used
by the web application.

## Configuration

Configuration is done via
[typed-env-config](https://github.com/taskcluster/typed-env-config) like all
other Taskcluster services. The main configuration file is `config.yml`, and
that refers to environment variables.  In production, those environment
variables are provided as part of the deployment.  During development,
configuration can be overridden in `user-config.yml`.

## Running Taskcluster-Web-Server locally

To run this service locally, install dependencies using `yarn`.

The `taskcluster.rootUrl` configuration setting is required. Either set
`TASKCLUSTER_ROOT_URL` in your environment, or copy `user-config-template.yml`
to `user-config.yml` and edit it to include the `rootUrl` for the Taskcluster
instance you are accessing; for example `https://taskcluster.net`.

That is enough to run the service, so if that's all you need, skip down to "Starting".

### Taskcluster Credentials

This service requires Taskcluster credentials to support user login and
receiving pulse messages, but this is not required for development of most
features.

To set up Taskcluster credentials, use
[taskcluster-cli](https://github.com/taskcluster/taskcluster-cli) to set
`TASKCLUSTER_ROOT_URL`, `TASKCLUSTER_CLIENT_ID`, and `TASKCLUSTER_ACCESS_TOKEN`
in your shell:

```shell
$ eval $(./taskcluster signin --name taskcluster-web-server)
```

### Pulse

Pulse messages are entirely optional, and most server components do not require
them. If you do not configure pulse, the server will act as if no pulse
messages are received, which is sufficient for most development work.

To receive pulse messages, you will also need a Pulse user.  For Mozilla's
Pulse, you can get such credentials at https://pulseguardian.mozilla.org.  Use
hostname `pulse.mozilla.org` and vhost `/`. In this situation, set the
namespace to match the username.

### Starting

In any case, use the command `yarn start` to start the service.

You should see the following message in the console, for example, using port 3050:

```bash
Web server running on port 3050.

Open the interactive GraphQL Playground, schema explorer and docs in your browser at:
    http://localhost:3050
```

The `taskcluster-web` service expects this service to run on port 3050.

### Passing Credentials in the Playground

To pass credentials to the server from the GraphQL Playground, click the "HTTP Headers"
section, and paste a JSON object with a key of "Authorization" with a value of
"Bearer YOUR_ACCESS_TOKEN", such as:

```json
{
  "Authorization": "Bearer eyJ0...yXlBw"
}
```

<img src="https://cldup.com/XDpBc-qY5Q.png" alt="authorization header" height="75%" width="75%" />

## Login Strategies

### GitHub

In order to enable the GitHub login strategy, add `github` to the
space-separated `LOGIN_STRATEGIES` environment variable, or set `app.loginStrategies` in `user-config.yml`.

Next, specify the GitHub client ID and secret for an OAuth application created
for use against this service and its web UI, either as environment variables:

```sh
GITHUB_CLIENT_ID="<insert GitHub client ID here>"
GITHUB_CLIENT_SECRET="<insert GitHub client secret here>"
```

or as `githubLogin.clientId` and `githubLogin.clientSecret` in `user-config.yml`.

Now, start the service as you normally would.

**Note: be sure to not commit these environment variables to source control,
and use a separate client ID and secret for production than used in
development.**

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
