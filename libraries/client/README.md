# TaskCluster Client [![Circle CI](https://circleci.com/gh/taskcluster/taskcluster-client.svg?style=badge)](https://circleci.com/gh/taskcluster/taskcluster-client)
_A taskcluster client library for node.js._

This client library is generated from the auto-generated API reference.
You can create a Client class from a JSON reference object at runtime using
`taskcluster.createClient(reference)`. But there is also a set of builtin
references from which Client classes are already constructed.

## Calling API End-Points
To invoke an API end-point instantiate a taskcluster Client class, these are
classes can be created from a JSON reference object, but a number of them are
also built-in to this library. In the following example we instantiate an
instance of the `Queue` Client class and use to to create a task.

```js
var taskcluster = require('taskcluster-client');

// Instantiate the Queue Client class
var queue = new taskcluster.Queue({
  timeout: 30 * 1000, // timeout for _each_ invidual http request

  // By default we share a global agent if you specify your instance
  // will have it's own agent with the given options...
  agent: {
    // https://nodejs.org/api/http.html#http_new_agent_options
  },

  credentials: {
    clientId:     '...',
    accessToken:  '...',
    // Certificate must also be provided if using temporary credentials,
    // this can be either a JSON object or a JSON string.
    certificate:  {...}   // Only applicable for temporary credentials
  }
});

// Create task using the queue client
var taskId = '...';
queue.createTask(taskId, payload).then(function(result) {
  // status is a task status structure
  console.log(result.status);
});
```

The `payload` parameter is always a JSON object as documented by the REST API
documentation. The methods always returns a _promise_ for the response JSON
object as documented in the REST API documentation.

## Listening for Events
Many TaskCluster components publishes messages about current events to pulse.
The JSON reference object also contains meta-data about declared pulse
exchanges and their routing key construction. This is designed to make it easy
to construct routing key patterns and parse routing keys from incoming messages.

The following example create a `listener` and instantiate an instance of
the Client class `QueueEvents` which we use to find the exchange and create
a routing pattern to listen for completion of a specific task. The
`taskCompleted` method will construct a routing key pattern by using `*` or `#`
for missing entries, pending on whether or not they are single word or
multi-key entries.

```js
var taskcluster = require('taskcluster-client');

// Create a listener (this creates a queue on AMQP)
var listener = new taskcluster.PulseListener({
  credentials: {
    username:           '...',      // Pulse username from pulse guardian
    password:           '...'       // Pulse password from pulse guardian
  }
});

// Instantiate the QueueEvents Client class
var queueEvents = new taskcluster.QueueEvents();

// Bind to task-completed events from queue that matches routing key pattern:
//   'primary.<myTaskId>.*.*.*.*.*.#'
listener.bind(queueEvents.taskCompleted({taskId: '<myTaskId>'}));

// Listen for messages
listener.on('message', function(message) {
  message.exchange        // Exchange from which message came
  message.payload         // Documented on docs.taskcluster.net
  message.routingKey      // Message routing key in string format
  message.routing.taskId  // Element from parsed routing key
  message.routing.runId   // ...
  message.redelivered     // True, if message has been nack'ed and requeued
  message.routes          // List of CC'ed routes, without the `route.` prefix
  return new Promise(...);
});

// Listen and consume events:
listener.resume().then(function() {
  // Now listening
});
```

To bind to a custom routing-key like the task-specific routes that messages
from the queue is CC'ed to, just provide the desired routing key to the
method for exchange. See example below.

```js
var RawRoutingPattern = 'route.task.specific.routing.key';
listener.bind(queueEvents.taskCompleted(RawRoutingPattern);
```


## Advanced Listening

For advanced queue usage the `connect` method can be used to
create and bind the queue and return an associated
[amqplib](http://www.squaremobius.net/amqp.node/doc/channel_api.html) channel:

```js
var taskcluster = require('taskcluster-client');

// Create a listener
var listener = new taskcluster.PulseListener({
  username:     '...',
  password:     '...'
});

// See: http://www.squaremobius.net/amqp.node/doc/channel_api.html
var channel = listener.connect().then(function(channel) {
  return channel.consume(function(msg) {
    channel.ack(msg);
  });
});
```

The listener creates a AMQP queue, on the server side and subscribes to messages
on the queue. It's possible to use named queues, see details below. For details
on routing key entries refer to documentation on
[docs.taskcluster.net](docs.taskcluster.net).

**Remark,** API end-points and AMQP exchanges are typically documented in
separate reference files. For this reason they also have separate Client
classes, even if they are from the same component.

## Documentation
The set of API entries listed below is generated from the built-in references.
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
//  - https://auth.taskcluster.net/v1
var auth = new taskcluster.Auth(options);
```
 * `auth.listClients() : result`
 * `auth.client(clientId) : result`
 * `auth.createClient(clientId, payload) : result`
 * `auth.resetAccessToken(clientId) : result`
 * `auth.updateClient(clientId, payload) : result`
 * `auth.deleteClient(clientId) : void`
 * `auth.listRoles() : result`
 * `auth.role(roleId) : result`
 * `auth.createRole(roleId, payload) : result`
 * `auth.updateRole(roleId, payload) : result`
 * `auth.deleteRole(roleId) : void`
 * `auth.awsS3Credentials(level, bucket, prefix) : result`
 * `auth.azureTableSAS(account, table) : result`
 * `auth.authenticateHawk(payload) : result`
 * `auth.importClients(payload) : void`
 * `auth.ping() : void`

### Methods in `taskcluster.AwsProvisioner`
```js
// Create AwsProvisioner client instance with default baseUrl:
//  - https://aws-provisioner.taskcluster.net/v1
var awsProvisioner = new taskcluster.AwsProvisioner(options);
```
 * `awsProvisioner.createWorkerType(workerType, payload) : result`
 * `awsProvisioner.updateWorkerType(workerType, payload) : result`
 * `awsProvisioner.workerType(workerType) : result`
 * `awsProvisioner.removeWorkerType(workerType) : void`
 * `awsProvisioner.listWorkerTypes() : result`
 * `awsProvisioner.createSecret(token, payload) : void`
 * `awsProvisioner.getSecret(token) : result`
 * `awsProvisioner.instanceStarted(instanceId, token) : void`
 * `awsProvisioner.removeSecret(token) : void`
 * `awsProvisioner.getLaunchSpecs(workerType) : result`
 * `awsProvisioner.awsState() : void`
 * `awsProvisioner.state(workerType) : void`
 * `awsProvisioner.ping() : void`
 * `awsProvisioner.apiReference() : void`

### Methods in `taskcluster.Index`
```js
// Create Index client instance with default baseUrl:
//  - https://index.taskcluster.net/v1
var index = new taskcluster.Index(options);
```
 * `index.findTask(namespace) : result`
 * `index.listNamespaces(namespace, payload) : result`
 * `index.listTasks(namespace, payload) : result`
 * `index.insertTask(namespace, payload) : result`
 * `index.findArtifactFromTask(namespace, name) : void`
 * `index.ping() : void`

### Methods in `taskcluster.PurgeCache`
```js
// Create PurgeCache client instance with default baseUrl:
//  - https://purge-cache.taskcluster.net/v1
var purgeCache = new taskcluster.PurgeCache(options);
```
 * `purgeCache.purgeCache(provisionerId, workerType, payload) : void`
 * `purgeCache.ping() : void`

### Methods in `taskcluster.Queue`
```js
// Create Queue client instance with default baseUrl:
//  - https://queue.taskcluster.net/v1
var queue = new taskcluster.Queue(options);
```
 * `queue.task(taskId) : result`
 * `queue.status(taskId) : result`
 * `queue.createTask(taskId, payload) : result`
 * `queue.defineTask(taskId, payload) : result`
 * `queue.scheduleTask(taskId) : result`
 * `queue.rerunTask(taskId) : result`
 * `queue.cancelTask(taskId) : result`
 * `queue.pollTaskUrls(provisionerId, workerType) : result`
 * `queue.claimTask(taskId, runId, payload) : result`
 * `queue.reclaimTask(taskId, runId) : result`
 * `queue.reportCompleted(taskId, runId) : result`
 * `queue.reportFailed(taskId, runId) : result`
 * `queue.reportException(taskId, runId, payload) : result`
 * `queue.createArtifact(taskId, runId, name, payload) : result`
 * `queue.getArtifact(taskId, runId, name) : void`
 * `queue.getLatestArtifact(taskId, name) : void`
 * `queue.listArtifacts(taskId, runId) : result`
 * `queue.listLatestArtifacts(taskId) : result`
 * `queue.pendingTasks(provisionerId, workerType) : result`
 * `queue.ping() : void`

### Methods in `taskcluster.Scheduler`
```js
// Create Scheduler client instance with default baseUrl:
//  - https://scheduler.taskcluster.net/v1
var scheduler = new taskcluster.Scheduler(options);
```
 * `scheduler.createTaskGraph(taskGraphId, payload) : result`
 * `scheduler.extendTaskGraph(taskGraphId, payload) : result`
 * `scheduler.status(taskGraphId) : result`
 * `scheduler.info(taskGraphId) : result`
 * `scheduler.inspect(taskGraphId) : result`
 * `scheduler.inspectTask(taskGraphId, taskId) : result`
 * `scheduler.ping() : void`

### Methods in `taskcluster.Secrets`
```js
// Create Secrets client instance with default baseUrl:
//  - https://secrets.taskcluster.net/v1
var secrets = new taskcluster.Secrets(options);
```
 * `secrets.set(name, payload) : void`
 * `secrets.update(name, payload) : void`
 * `secrets.remove(name) : void`
 * `secrets.get(name) : result`
 * `secrets.ping() : void`

### Exchanges in `taskcluster.AwsProvisionerEvents`
```js
// Create AwsProvisionerEvents client instance with default exchangePrefix:
//  - exchange/taskcluster-aws-provisioner/
var awsProvisionerEvents = new taskcluster.AwsProvisionerEvents(options);
```
 * `awsProvisionerEvents.workerTypeCreated(routingKeyPattern) : binding-info`
 * `awsProvisionerEvents.workerTypeUpdated(routingKeyPattern) : binding-info`
 * `awsProvisionerEvents.workerTypeRemoved(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.PurgeCacheEvents`
```js
// Create PurgeCacheEvents client instance with default exchangePrefix:
//  - exchange/taskcluster-purge-cache/v1/
var purgeCacheEvents = new taskcluster.PurgeCacheEvents(options);
```
 * `purgeCacheEvents.purgeCache(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.QueueEvents`
```js
// Create QueueEvents client instance with default exchangePrefix:
//  - exchange/taskcluster-queue/v1/
var queueEvents = new taskcluster.QueueEvents(options);
```
 * `queueEvents.taskDefined(routingKeyPattern) : binding-info`
 * `queueEvents.taskPending(routingKeyPattern) : binding-info`
 * `queueEvents.taskRunning(routingKeyPattern) : binding-info`
 * `queueEvents.artifactCreated(routingKeyPattern) : binding-info`
 * `queueEvents.taskCompleted(routingKeyPattern) : binding-info`
 * `queueEvents.taskFailed(routingKeyPattern) : binding-info`
 * `queueEvents.taskException(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.SchedulerEvents`
```js
// Create SchedulerEvents client instance with default exchangePrefix:
//  - exchange/taskcluster-scheduler/v1/
var schedulerEvents = new taskcluster.SchedulerEvents(options);
```
 * `schedulerEvents.taskGraphRunning(routingKeyPattern) : binding-info`
 * `schedulerEvents.taskGraphExtended(routingKeyPattern) : binding-info`
 * `schedulerEvents.taskGraphBlocked(routingKeyPattern) : binding-info`
 * `schedulerEvents.taskGraphFinished(routingKeyPattern) : binding-info`

<!-- END OF GENERATED DOCS -->

## Construct Urls
You can build a url for any request, but this feature is mostly useful for
request that doesn't require any authentication. If you need authentication
take a look at the section on building signed urls, which is possible for all
`GET` requests. To construct a url for a request use the `buildUrl` method, as
illustrated in the following example:

```js
// Create queue instance
var queue = new taskcluster.Queue(...);

// Build url to get a specific task
var url = queue.buildUrl(
  queue.getTask,    // Method to build url for.
  taskId            // First parameter for the method, in this case taskId
);
```

Please, note that the `payload` parameter cannot be encoded in urls. And must be
sent when using a constructed urls. Again, this is not a problem as most methods
that takes a `payload` also requires authentication.


## Construct Signed Urls
It's possible to build both signed urls for all `GET` requests. A signed url
contains a query-string parameter called `bewit`, this parameter holds
expiration time, signature and scope restrictions (if applied). The signature
covers the following parameters:

  * Expiration time,
  * Url and query-string, and
  * scope restrictions (if applied)

These signed urls is very convenient if you want to grant somebody access to
specific resource without proxying the request or sharing your credentials.
For example it's fairly safe to provide someone with a signed url for a
specific artifact that is protected by a scope. See example below.

```js
// Create queue instance
var queue = new taskcluster.Queue(...);

// Build signed url
var signedUrl = queue.buildSignedUrl(
  queue.getArtifactFromRun,   // method to build signed url for.
  taskId,                     // TaskId parameter
  runId,                      // RunId parameter
  artifactName,               // Artifact name parameter
  {
    expiration:     60 * 10   // Expiration time in seconds
});
```

Please, note that the `payload` parameter cannot be encoded in the signed url
and must be sent as request payload. This should work fine, just remember that
it's only possible to make signed urls for `GET` requests, which in most cases
don't take a payload.

Also please consider using a relatively limited expiration time, as it's not
possible to retract a signed url without revoking your credentials.
For more technical details on signed urls, see _bewit_ urls in
[hawk](https://github.com/hueniverse/hawk).

## Generating Temporary Credentials
If you have non-temporary taskcluster credentials you can generate a set of
temporary credentials as follows. Notice that the credentials cannot last more
than 31 days, and you can only revoke them by revoking the credentials that was
used to issue them (this takes up to one hour).

```js
var credentials = taskcluster.createTemporaryCredentials({
  // Validity of temporary credentials starts here
  start:              new Date(),
  // Expiration of temporary credentials
  expiry:             new Date(new Date().getTime() + 5 * 60 * 1000),
  // Scopes to grant the temporary credentials
  scopes:             ['ScopeA', 'ScopeB', ...]
  credentials: {      // Non-temporary taskcluster credentials
    clientId:         '...'
    accessToken:      '...'
  }
});
```

You cannot use temporary credentials to issue new temporary credentials.

## Create Client Class Dynamically
You can create a Client class from a reference JSON object as illustrated
below:

```js
var reference = {...}; // JSON from references.taskcluster.net/...

// Create Client class
var MyClient = taskcluster.createClient(reference);

// Instantiate an instance of MyClient
var myClient = new MyClient(options);

// Make a request with a method on myClient
myClient.myMethod(arg1, arg2, payload).then(function(result) {
  // ...
});
```

## Configuration of API Invocations
There is a number of configuration options for Client which affects invocation
of API end-points. These are useful if using a non-default server, for example
when setting up a staging area or testing locally.

### Configuring API BaseUrls
If you use the builtin API Client classes documented above you can configure
the `baseUrl` when creating an instance of the client. As illustrated below:

```js
var auth = new taskcluster.Auth({
  credentials:  {...},
  baseUrl:      "http://localhost:4040" // Useful for development and testing
});
```

### Configuring Credentials
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

If the `clientId` and `accessToken` are left empty we also check the
`TASKCLUSTER_CLIENT_ID` and `TASKCLUSTER_ACCESS_TOKEN` environment variables
to use as defaults (similar to how AWS, Azure, etc. handle authentication).

### Restricting Authorized Scopes
If you wish to perform requests on behalf of a third-party that has small set of
scopes than you do. You can specify which scopes your request should be allowed
to use, in the key `authorizedScopes`. This is useful when the scheduler
performs a request on behalf of a task-graph, or when authentication takes
place in a trusted proxy. See example below:

```js
// Create a Queue Client class can only define tasks for a specific workerType
var queue = new taskcluster.Queue({
  // Credentials that can define tasks for any provisioner and workerType.
  credentials: {
    clientId:       '...',
    accessToken:    '...'
  },
  // Restricting this instance of the Queue client to only one scope
  authorizedScopes: ['queue:post:define-task/my-provisioner/my-worker-type']
});

// This request will only be successful, if the task posted is aimed at
// "my-worker-type" under "my-provisioner".
queue.defineTask(taskId taskDefinition).then(function(result) {
  // ...
});
```


## Configuration of Exchange Bindings
When a taskcluster Client class is instantiated the option `exchangePrefix` may
be given. This will replace the default `exchangePrefix`. This can be useful if
deploying a staging area or similar. See example below:

```js

// Instantiate the QueueEvents Client class
var queueEvents = new taskcluster.QueueEvents({
  exchangePrefix:     'staging-queue/v1/'
});

// This listener will now bind to: staging-queue/v1/task-completed
listener.bind(queueEvents.taskCompleted({taskId: '<myTaskId>'}));
```

## Using the Listener
TaskCluster relies on pulse for exchange of messages. You'll need an pulse
credentials for using `taskcluster.PulseListener`.
An outline of how to create an instance and use is given below. Note, you
must call `resume()` before message starts arriving.

```js
var listener = new taskcluster.PulseListener({
  prefetch:             5,          // Number of tasks to process in parallel
  credentials: {                    // If not instance of PulseConnection
    username:           '...',      // Pulse username from pulse guardian
    password:           '...'       // Pulse password from pulse guardian
  },
  connection:           connection, // If credentials isn't provided
  // If no queue name is given, the queue is:
  //    exclusive, autodeleted and non-durable
  // If a queue name is given, the queue is:
  //    durable, not auto-deleted and non-exclusive
  queueName:          'my-queue',   // Queue name, undefined if none
  maxLength:          0,            // Max allowed queue size
});

listener.connect().then(...);       // Setup listener and bind queue
listener.resume().then(...);        // Start getting new messages
listener.pause().then(...);         // Pause retrieval of new messages
listener.deleteQueue();             // Delete named queue and disconnect
listener.close();                   // Disconnect from pulse
```

**Using `PulseConnection`**, instead of giving a `username` and `password` it
is possible to give the `Listener` the key `connection` which must then be a
`taskcluster.PulseConnection` object. Using a `PulseConnection` object it's
possible to have multiple listeners using the same AMQP TCP connection, which
is the recommended way of using AMQP. Notice, that the `PulseConnection` will
not be closed with the `Listener`s, so you must `close()` it manually.

```js
var connection = new taskcluster.PulseConnection({
  username:           '...',        // Pulse username from pulse guardian
  password:           '...'         // Pulse password from pulse guardian
});

// Create listener
var listener = new taskcluster.PulseListener({
  connection:         connection,   // AMQP connection object
});


connection.close();                 // Disconnect from AMQP/pulse
```

## Relative Date-time Utilities
A lot of taskcluster APIs requires ISO 8601 time stamps offset into the future
as way of providing expiration, deadlines, etc. These can be easily created
using `new Date().toJSON()`, however, it can be rather error prone and tedious
to offset `Date` objects into the future. Therefore this library comes with two
utility functions for this purposes.

```js
var dateObject = taskcluster.fromNow("2 days 3 hours 1 minute");
var dateString = taskcluster.fromNowJSON("2 days 3 hours 1 minute");
assert(dateObject.toJSON() === dateString);
// dateObject = now() + 2 days 2 hours and 1 minute
assert(new Date().getTime() < dateObject.getTime());
```

By default it will offset the date time into the future, if the offset strings
are prefixed minus (`-`) the date object will be offset into the past. This is
useful in some corner cases.

```js
var dateObject = taskcluster.fromNow("- 1 year 2 months 3 weeks 5 seconds");
// dateObject = now() - 1 year, 2 months, 3 weeks and 5 seconds
assert(new Date().getTime() > dateObject.getTime());
```

The offset string is ignorant of whitespace and case insensitive. It may also
optionally be prefixed plus `+` (if not prefixed minus), any `+` prefix will be
ignored. However, entries in the offset string must be given in order from
high to low, ie. `2 years 1 day`. Additionally, various shorthands may be
employed, as illustrated below.

```
  years,    year,   yr,   y
  months,   month,  mo
  weeks,    week,   wk,   w
  days,     day,          d
  hours,    hour,   hr,   h
  minutes,  minute, min
  seconds,  second, sec,  s
```

The `fromNow` method may also be given a date to be relative to as a second
argument. This is useful if offset the task expiration relative to the the task
deadline or doing something similar.

```js
var dateObject1 = taskcluster.fromNow("2 days 3 hours");
// dateObject1  = now() + 2 days and 3 hours
var dateObject2 = taskcluster.fromNow("1 year", dateObject1);
// dateObject2  = now() + 1 year, 2 days and 3 hours
```

## Generating slugids
In node you can rely on the `slugid` module to generate slugids, but we already
need it in `taskcluster-client` and expose the preferred slugid generation
function as `taskcluster.slugid()`.

```js
var taskcluster = require('taskcluster-client');

// Generate new taskId
var taskId = taskcluster.slugid();
```

The generates _nice_ random slugids, refer to slugid module for further details.

## Using `taskcluster-client` in a Browser
Running the script `bin/update-apis.js browserify` will generate
`taskcluster-client.js` using browserify. This does not contain any listener,
but all the API logic and references is present. To get AMQP events in the
browser use
[events.taskcluster.net](https://github.com/taskcluster/taskcluster-events).

## Updating Builtin APIs
When releasing a new version of the `taskcluster-client` library, we should
always update the builtin references using `bin/update-apis.js update`. This
maintenance script can be used to list, show, add, remove and update builtin
API definitions.

##License
The taskcluster client library is released on [MPL 2.0](http://mozilla.org/MPL/2.0/).
