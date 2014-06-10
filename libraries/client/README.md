# TaskCluster Client [![Build Status](https://travis-ci.org/taskcluster/taskcluster-client.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-client)
_A taskcluster client library for node.js._

## Usage
This client library is generated from the auto-generated API reference.
You can create a Client class from a JSON reference object at runtime using
`taskcluster.createClient(reference)`. But there is also a set of builtin
references from which Client classes are already constructed.

```js
var taskcluster = require('taskcluster-client');

// Instantiate the Queue Client class
var queue = new taskcluster.Queue({
  credentials: {
    clientId:     '...',
    accessToken:  '...'
  }
});

// Create task using the queue client
queue.createTask(task).then(function(result) {
  // status is a task status structure
  console.log(result.status);
});
```

The `payload` parameter is always a JSON object as documented by the REST API
documentation. The methods always returns a _promise_ for the response JSON
object as documented in the REST API documentation.

## Documentation
The set of API entries listed below is generated from the builtin references.
Detailed documentation with description, payload and result format details is
available on [docs.taskcluster.net](http://docs.taskcluster.net).

On the [documentation site](http://docs.taskcluster.net) entries often have a
_signature_, you'll find that it matches the signatures below. Notice that all
the methods returns a promise. A method with `: void` also returns a promise,
that either resolves without giving a value or rejects with an error.

<!-- START OF GENERATED DOCS -->

### Methods in `taskcluster.Auth`
```js
// Create Auth client instance with default baseUrl:
//  - http://auth.taskcluster.net/v1
var auth = new taskcluster.Auth(options);
```
 * `auth.inspect(clientId) : result`
 * `auth.getCredentials(clientId) : result`

### Methods in `taskcluster.Queue`
```js
// Create Queue client instance with default baseUrl:
//  - http://queue.taskcluster.net/v1
var queue = new taskcluster.Queue(options);
```
 * `queue.createTask(payload) : result`
 * `queue.defineTasks(payload) : result`
 * `queue.scheduleTask(taskId) : result`
 * `queue.getTaskStatus(taskId) : result`
 * `queue.claimTask(taskId, payload) : result`
 * `queue.requestArtifactUrls(taskId, payload) : result`
 * `queue.reportTaskCompleted(taskId, payload) : result`
 * `queue.claimWork(provisionerId, workerType, payload) : result`
 * `queue.rerunTask(taskId) : result`
 * `queue.getPendingTasks(provisionerId) : void`
 * `queue.getAMQPConnectionString() : result`

<!-- END OF GENERATED DOCS -->

## Create Client Class Dynamically
You can create a Client class from a reference JSON object as illustrated
below:

```js
var reference = {...}; // JSON from references.taskcluster.net/...

// Create Client class
var MyClient = taskcluster.createClient(reference);

// Instantiate an instance of MyClient
var myClient = new MyClient({
  credentials: {...}
});

// Make a request with a method on myClient
myClient.myMethod(arg1, arg2, payload).then(function(result) {
  // ...
});
```

## Configuring API BaseUrls
If you use the builtin API Client classes documented above you can configure
the `baseUrl` when creating an instance of the client. As illustrated below:

```js
var auth = new taskcluster.Auth({
  credentials:  {...},
  baseUrl:      "http://localhost:4040" // Useful for development and testing
});
```

## Configuring Credentials
When creating an instance of a Client class the credentials can be provided
in options. For example:
```js
var auth = new taskcluster.Auth({
  credentials: {
    clientId:     '...',
    accessToken:  '...'
  }
});
```

You can also configure default options globally using
`taskcluster.config(options)`, as follows:

```js
// Configure default options
taskcluster.config({
  credentials: {
    clientId:     '...',
    accessToken:  '...'
  }
});

// No credentials needed here
var auth = new taskcluster.Auth();
```

## Delegated Authorization
If your client has the scope `auth:can-delegate` you can send requests with
a scope set different from the one you have. This is useful when the
scheduler performs a request on behalf of a task-graph, or when
authentication takes place in a trusted proxy. See example below:

```js
// Create delegating instance of Auth Client class
var auth = new taskcluster.Auth({
  credentials: {
    clientId:     '...',
    accessToken:  '...',
    delegating:   true,
    scopes:       ['scope', ...]  // For example task.scopes
  }
});

// This request is only successful if the set of scopes declared above
// allows the request to come through. The set of scopes the client has
// will not be used to authorize this request.
auth.getCredentials(someClientId).then(function(result) {
  // ...
});
```
We call this delegated authorization, because the trusted node that has the
scope `auth:can-delegate`, delegates authorization of the request to API
end-point.

## Updating Builtin APIs
When releasing a new version of the `taskcluster-client` library, we should
always update the builtin references using `utils/update-apis.js` this
maintenance script can be used to list, show, add, remove and update builtin
API definitions.

When `apis.json` is updated, please run `utils/generate-docs.js` to update
the documentation in this file.

##License
The taskcluster client library is released on [MPL 2.0](http://mozilla.org/MPL/2.0/).
