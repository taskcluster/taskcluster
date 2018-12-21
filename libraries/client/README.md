# TaskCluster Client
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-client.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-client)
[![Node Dependencies Status](https://david-dm.org/taskcluster/taskcluster-client.svg)](https://david-dm.org/taskcluster/taskcluster-client)
[![npm](https://img.shields.io/npm/v/taskcluster-client.svg?maxAge=2592000)](https://www.npmjs.com/package/taskcluster-client)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

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
  // rootUrl for this Taskcluster instance
  rootUrl: 'https://taskcluster.myproject.org',

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

If you need to create a client similar to a existing client, but with some
options changed, use `client.use(options)`:

```js
queue
  .use({authorizedScopes: [..]})
  .createTask(..)
  .then(..);
```

This replaces any given options with new values.


## Listening for Events

**NOTE** `PulseListener` is no longer included in `taskcluster-client`;
instead, use `PulseConsumer` from
[taskcluster-lib-pulse](https://github.com/taskcluster/taskcluster-lib-pulse).

However, this library helpfully includes bindings for exchanges declared by
various Taskcluster services.  To use these with `taskcluster-lib-pulse`,
create an `..Events` instance, call the apprporiate methods on it to construct
a binding, and pass that to `pulse.consume`:

```js
var taskcluster = require('taskcluster-client');

// Instantiate the QueueEvents Client class
var queueEvents = new taskcluster.QueueEvents({rootUrl: ..});

let pc = await pulse.consume({
  bindings: [
    // Bind to task-completed events from queue that matches routing key pattern:
    //   'primary.<myTaskId>.*.*.*.*.*.#'
    queueEvents.taskCompleted({taskId: myTaskId});
  ], ..);
```

## Documentation

The set of API entries listed below is generated from the built-in references.
Detailed documentation with description, payload and result format details is
available in the [docs reference section](https://docs.taskcluster.net/docs/reference).

On the documentation site, entries have a
_signature_.  You'll find that it matches the signatures below. Notice that all
the methods returns a promise. A method with `: void` also returns a promise,
that either resolves without giving a value or rejects with an error.

## Fake API Methods

In testing, it is useful to be able to "fake out" client methods so that they
do not try to communicate with an actual, external service. The normal client
argument checking still takes place, and a function of your design will be called
instead of calling the external service.

This is set up when constructing the client. Typically, this occurs in a
`taskcluster-lib-loader` entry.

```javascript
setup(function () {
  // inject the dependency with a stickyLoader from taskcluster-lib-testing
  helper.load.inject('secrets', new taskcluster.Secrets({
    fake: {
      get: (name) => 'my-hardcoded-secret',
    },
  });
});

test('test the thing', async function() {
  // Get secrets from injection above
  let secrets = await helper.load('secrets');

  // Do something with the secrets object
  let s = await secrets.get('thing-to-read');
  assume(s).is.a('string');

  // Make assertions over recorded calls
  assume(secrets.fakeCalls.get).deep.contains({
    name: 'thing-to-read',
  });

  try {
    await secrets.remove('...', {}); // throws and error because we didn't fake it
  } catch (err) {
    // pass
  }
});
```

<!-- START OF GENERATED DOCS -->

### Methods in `taskcluster.Auth`
```js
// Create Auth client instance:
//  - undefined
var auth = new taskcluster.Auth(options);
```
 * `auth.ping() : void`
 * `auth.listClients([options]) : result`
 * `auth.client(clientId) : result`
 * `auth.createClient(clientId, payload) : result`
 * `auth.resetAccessToken(clientId) : result`
 * `auth.updateClient(clientId, payload) : result`
 * `auth.enableClient(clientId) : result`
 * `auth.disableClient(clientId) : result`
 * `auth.deleteClient(clientId) : void`
 * `auth.listRoles() : result`
 * `auth.role(roleId) : result`
 * `auth.createRole(roleId, payload) : result`
 * `auth.updateRole(roleId, payload) : result`
 * `auth.deleteRole(roleId) : void`
 * `auth.expandScopesGet(payload) : result`
 * `auth.expandScopes(payload) : result`
 * `auth.currentScopes() : result`
 * `auth.awsS3Credentials(level, bucket, prefix, [options]) : result`
 * `auth.azureAccounts() : result`
 * `auth.azureTables(account, [options]) : result`
 * `auth.azureTableSAS(account, table, level) : result`
 * `auth.azureContainers(account, [options]) : result`
 * `auth.azureContainerSAS(account, container, level) : result`
 * `auth.sentryDSN(project) : result`
 * `auth.statsumToken(project) : result`
 * `auth.webhooktunnelToken() : result`
 * `auth.authenticateHawk(payload) : result`
 * `auth.testAuthenticate(payload) : result`
 * `auth.testAuthenticateGet() : result`

### Methods in `taskcluster.AwsProvisioner`
```js
// Create AwsProvisioner client instance:
//  - https://aws-provisioner.taskcluster.net/v1
var awsProvisioner = new taskcluster.AwsProvisioner(options);
```
 * `awsProvisioner.listWorkerTypeSummaries() : result`
 * `awsProvisioner.createWorkerType(workerType, payload) : result`
 * `awsProvisioner.updateWorkerType(workerType, payload) : result`
 * `awsProvisioner.workerTypeLastModified(workerType) : result`
 * `awsProvisioner.workerType(workerType) : result`
 * `awsProvisioner.removeWorkerType(workerType) : void`
 * `awsProvisioner.listWorkerTypes() : result`
 * `awsProvisioner.createSecret(token, payload) : void`
 * `awsProvisioner.getSecret(token) : result`
 * `awsProvisioner.instanceStarted(instanceId, token) : void`
 * `awsProvisioner.removeSecret(token) : void`
 * `awsProvisioner.getLaunchSpecs(workerType) : result`
 * `awsProvisioner.state(workerType) : void`
 * `awsProvisioner.backendStatus() : result`
 * `awsProvisioner.ping() : void`

### Methods in `taskcluster.EC2Manager`
```js
// Create EC2Manager client instance:
//  - https://ec2-manager.taskcluster.net/v1
var eC2Manager = new taskcluster.EC2Manager(options);
```
 * `eC2Manager.ping() : void`
 * `eC2Manager.listWorkerTypes() : result`
 * `eC2Manager.runInstance(workerType, payload) : void`
 * `eC2Manager.terminateWorkerType(workerType) : void`
 * `eC2Manager.workerTypeStats(workerType) : result`
 * `eC2Manager.workerTypeHealth(workerType) : result`
 * `eC2Manager.workerTypeErrors(workerType) : result`
 * `eC2Manager.workerTypeState(workerType) : result`
 * `eC2Manager.ensureKeyPair(name, payload) : void`
 * `eC2Manager.removeKeyPair(name) : void`
 * `eC2Manager.terminateInstance(region, instanceId) : void`
 * `eC2Manager.getPrices() : result`
 * `eC2Manager.getSpecificPrices(payload) : result`
 * `eC2Manager.getHealth() : result`
 * `eC2Manager.getRecentErrors() : result`
 * `eC2Manager.regions() : void`
 * `eC2Manager.amiUsage() : void`
 * `eC2Manager.ebsUsage() : void`
 * `eC2Manager.dbpoolStats() : void`
 * `eC2Manager.allState() : void`
 * `eC2Manager.sqsStats() : void`
 * `eC2Manager.purgeQueues() : void`

### Methods in `taskcluster.Github`
```js
// Create Github client instance:
//  - undefined
var github = new taskcluster.Github(options);
```
 * `github.ping() : void`
 * `github.githubWebHookConsumer() : void`
 * `github.builds([options]) : result`
 * `github.badge(owner, repo, branch) : void`
 * `github.repository(owner, repo) : result`
 * `github.latest(owner, repo, branch) : void`
 * `github.createStatus(owner, repo, sha, payload) : void`
 * `github.createComment(owner, repo, number, payload) : void`

### Methods in `taskcluster.Hooks`
```js
// Create Hooks client instance:
//  - undefined
var hooks = new taskcluster.Hooks(options);
```
 * `hooks.ping() : void`
 * `hooks.listHookGroups() : result`
 * `hooks.listHooks(hookGroupId) : result`
 * `hooks.hook(hookGroupId, hookId) : result`
 * `hooks.getHookStatus(hookGroupId, hookId) : result`
 * `hooks.createHook(hookGroupId, hookId, payload) : result`
 * `hooks.updateHook(hookGroupId, hookId, payload) : result`
 * `hooks.removeHook(hookGroupId, hookId) : void`
 * `hooks.triggerHook(hookGroupId, hookId, payload) : result`
 * `hooks.getTriggerToken(hookGroupId, hookId) : result`
 * `hooks.resetTriggerToken(hookGroupId, hookId) : result`
 * `hooks.triggerHookWithToken(hookGroupId, hookId, token, payload) : result`

### Methods in `taskcluster.Index`
```js
// Create Index client instance:
//  - undefined
var index = new taskcluster.Index(options);
```
 * `index.ping() : void`
 * `index.findTask(indexPath) : result`
 * `index.listNamespaces(namespace, [options]) : result`
 * `index.listTasks(namespace, [options]) : result`
 * `index.insertTask(namespace, payload) : result`
 * `index.findArtifactFromTask(indexPath, name) : void`

### Methods in `taskcluster.Login`
```js
// Create Login client instance:
//  - undefined
var login = new taskcluster.Login(options);
```
 * `login.ping() : void`
 * `login.oidcCredentials(provider) : result`

### Methods in `taskcluster.Notify`
```js
// Create Notify client instance:
//  - undefined
var notify = new taskcluster.Notify(options);
```
 * `notify.ping() : void`
 * `notify.email(payload) : void`
 * `notify.pulse(payload) : void`
 * `notify.irc(payload) : void`

### Methods in `taskcluster.Pulse`
```js
// Create Pulse client instance:
//  - https://pulse.taskcluster.net/v1/
var pulse = new taskcluster.Pulse(options);
```
 * `pulse.ping() : void`
 * `pulse.listNamespaces([options]) : result`
 * `pulse.namespace(namespace) : result`
 * `pulse.claimNamespace(namespace, payload) : result`

### Methods in `taskcluster.PurgeCache`
```js
// Create PurgeCache client instance:
//  - undefined
var purgeCache = new taskcluster.PurgeCache(options);
```
 * `purgeCache.ping() : void`
 * `purgeCache.purgeCache(provisionerId, workerType, payload) : void`
 * `purgeCache.allPurgeRequests([options]) : result`
 * `purgeCache.purgeRequests(provisionerId, workerType, [options]) : result`

### Methods in `taskcluster.Queue`
```js
// Create Queue client instance:
//  - undefined
var queue = new taskcluster.Queue(options);
```
 * `queue.ping() : void`
 * `queue.task(taskId) : result`
 * `queue.status(taskId) : result`
 * `queue.listTaskGroup(taskGroupId, [options]) : result`
 * `queue.listDependentTasks(taskId, [options]) : result`
 * `queue.createTask(taskId, payload) : result`
 * `queue.defineTask(taskId, payload) : result`
 * `queue.scheduleTask(taskId) : result`
 * `queue.rerunTask(taskId) : result`
 * `queue.cancelTask(taskId) : result`
 * `queue.claimWork(provisionerId, workerType, payload) : result`
 * `queue.claimTask(taskId, runId, payload) : result`
 * `queue.reclaimTask(taskId, runId) : result`
 * `queue.reportCompleted(taskId, runId) : result`
 * `queue.reportFailed(taskId, runId) : result`
 * `queue.reportException(taskId, runId, payload) : result`
 * `queue.createArtifact(taskId, runId, name, payload) : result`
 * `queue.completeArtifact(taskId, runId, name, payload) : void`
 * `queue.getArtifact(taskId, runId, name) : void`
 * `queue.getLatestArtifact(taskId, name) : void`
 * `queue.listArtifacts(taskId, runId, [options]) : result`
 * `queue.listLatestArtifacts(taskId, [options]) : result`
 * `queue.listProvisioners([options]) : result`
 * `queue.getProvisioner(provisionerId) : result`
 * `queue.declareProvisioner(provisionerId, payload) : result`
 * `queue.pendingTasks(provisionerId, workerType) : result`
 * `queue.listWorkerTypes(provisionerId, [options]) : result`
 * `queue.getWorkerType(provisionerId, workerType) : result`
 * `queue.declareWorkerType(provisionerId, workerType, payload) : result`
 * `queue.listWorkers(provisionerId, workerType, [options]) : result`
 * `queue.getWorker(provisionerId, workerType, workerGroup, workerId) : result`
 * `queue.quarantineWorker(provisionerId, workerType, workerGroup, workerId, payload) : result`
 * `queue.declareWorker(provisionerId, workerType, workerGroup, workerId, payload) : result`

### Methods in `taskcluster.Secrets`
```js
// Create Secrets client instance:
//  - undefined
var secrets = new taskcluster.Secrets(options);
```
 * `secrets.ping() : void`
 * `secrets.set(name, payload) : void`
 * `secrets.remove(name) : void`
 * `secrets.get(name) : result`
 * `secrets.list([options]) : result`

### Exchanges in `taskcluster.AuthEvents`
```js
// Create AuthEvents client instance:
//  - exchange/taskcluster-auth/v1/
var authEvents = new taskcluster.AuthEvents(options);
```
 * `authEvents.clientCreated(routingKeyPattern) : binding-info`
 * `authEvents.clientUpdated(routingKeyPattern) : binding-info`
 * `authEvents.clientDeleted(routingKeyPattern) : binding-info`
 * `authEvents.roleCreated(routingKeyPattern) : binding-info`
 * `authEvents.roleUpdated(routingKeyPattern) : binding-info`
 * `authEvents.roleDeleted(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.AwsProvisionerEvents`
```js
// Create AwsProvisionerEvents client instance:
//  - exchange/taskcluster-aws-provisioner/v1/
var awsProvisionerEvents = new taskcluster.AwsProvisionerEvents(options);
```
 * `awsProvisionerEvents.workerTypeCreated(routingKeyPattern) : binding-info`
 * `awsProvisionerEvents.workerTypeUpdated(routingKeyPattern) : binding-info`
 * `awsProvisionerEvents.workerTypeRemoved(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.GithubEvents`
```js
// Create GithubEvents client instance:
//  - exchange/taskcluster-github/v1/
var githubEvents = new taskcluster.GithubEvents(options);
```
 * `githubEvents.pullRequest(routingKeyPattern) : binding-info`
 * `githubEvents.push(routingKeyPattern) : binding-info`
 * `githubEvents.release(routingKeyPattern) : binding-info`
 * `githubEvents.taskGroupDefined(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.PurgeCacheEvents`
```js
// Create PurgeCacheEvents client instance:
//  - exchange/taskcluster-purge-cache/v1/
var purgeCacheEvents = new taskcluster.PurgeCacheEvents(options);
```
 * `purgeCacheEvents.purgeCache(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.QueueEvents`
```js
// Create QueueEvents client instance:
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
 * `queueEvents.taskGroupResolved(routingKeyPattern) : binding-info`

### Exchanges in `taskcluster.TreeherderEvents`
```js
// Create TreeherderEvents client instance:
//  - exchange/taskcluster-treeherder/v1/
var treeherderEvents = new taskcluster.TreeherderEvents(options);
```
 * `treeherderEvents.jobs(routingKeyPattern) : binding-info`

<!-- END OF GENERATED DOCS -->

## Providing Options
Some API end-points may take query-string, this is indicated in the signature
above as `[options]`. These options are always _optional_, commonly used for
continuation tokens when paging a list. For list of supported options you
should consult API documentation.

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
  // Name of temporary credential (optional)
  clientId:           '...',
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

You cannot use temporary credentials to issue new temporary credentials.  You
must have `auth:create-client:<name>` to create a named temporary credential,
but unnamed temporary credentials can be created regardless of your scopes.

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

### Configuring API Root URL and Credentials

If you use the builtin API Client classes documented above you must configure
the `rootUrl` when creating an instance of the client. As illustrated below:

```js
var auth = new taskcluster.Auth({
  rootUrl:      "http://whatever.com"
});
```

You may also provide credentials. For example:
```js
var auth = new taskcluster.Auth({
  credentials: {
    clientId:     '...',
    accessToken:  '...'
  }
});
```
If the `clientId` and `accessToken` are not given, no credentials will be used.

You can set either or both of these values as global config options as below:

```js
// Configure default options
taskcluster.config({
  rootUrl: "https://somesite.com",
  credentials: {
    clientId:     '...',
    accessToken:  '...'
  }
});

// No rootUrl needed here
var auth = new taskcluster.Auth();
```

You can read credentials and rootUrl from the standard `TASKCLUSTER_…`
environment variables with `taskcluster.fromEnvVars()`:

```js
var auth = new taskcluster.Auth({
  ...taskcluster.fromEnvVars(),
});
// or (to get behavior like that in versions 11.0.0 and earlier):
taskcluster.config(taskcluster.fromEnvVars());
```

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
    password:           '...',      // Pulse password from pulse guardian
    hostname:           '...',      // hostname to connect to using username/password
    vhost   :           '...'       // virtual host to use on the AMQP host   
  },
  connection:           connection, // If credentials isn't provided
  // If no queue name is given, the queue is:
  //    exclusive, autodeleted and non-durable
  // If a queue name is given, the queue is:
  //    durable, not auto-deleted and non-exclusive
  queueName:          'my-queue',   // Queue name, undefined if none
  maxLength:          0,            // Max allowed queue size
});

listener.bind({exchange, routingKeyPattern}).then(...);
                                    // bind to an exchange; note that for
                                    // TaskCluster components the argument
                                    // can be created by Client; see above.
listener.connect().then(...);       // Setup listener and bind queue
listener.resume().then(...);        // Start getting new messages
listener.pause().then(...);         // Pause retrieval of new messages
listener.deleteQueue();             // Delete named queue and disconnect
listener.close();                   // Disconnect from pulse
```

To actually receive messages, subscribe to the listener's `message` event:

```js
listener.on('message', (message) => async {
  message.exchange
  message.payload
  .. etc. (see "Listening for Events", above)
});
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
  password:           '...',        // Pulse password from pulse guardian
  hostname:           '...',        // hostname to connect to using username/password
  vhost   :           '...'         // virtual host to use on the AMQP host   
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

## Handling Credentials

Your users may find the options for TaskCluster credentials overwhelming.  You
can help by interpreting the credentials for them.

The `credentialInformation(rootUrl, credentials)` function returns a promise
with information about the given credentials:

```js
{
   clientId: "..",      // name of the credential
   type: "..",          // type of credential, e.g., "temporary"
   active: "..",        // active (valid, not disabled, etc.)
   start: "..",         // validity start time (if applicable)
   expiry: "..",        // validity end time (if applicable)
   scopes: ["..."],     // associated scopes (if available)
}
```

The resulting information should *only* be used for presentation purposes, and
never for access control.  This function may fail unexpectedly with invalid
credentials, and performs no cryptographic checks.  It is acceptable to use the
scopes result to determine whether to display UI elements associated with a
particular scope, as long as the underlying API performs more reliable
authorization checks.

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

## Taskcluster client for the browser

**Not recommended**: Run the script `bin/update-apis.js browserify` to generate
`taskcluster-client.js` using browserify. This does not contain any listener,
but all the API logic and references is present. To get AMQP events in the
browser use
[events.taskcluster.net](https://github.com/taskcluster/taskcluster-events).

**Recommended**: Use the [`taskcluster-client-web`](https://www.npmjs.com/package/taskcluster-client-web)
library. The latter differs from `taskcluster-client` by providing a version
that is compatible with the browser out of the box and does not require a
build step to use.

## Updating Builtin APIs
When releasing a new version of the `taskcluster-client` library, we should
always update the builtin references using `bin/update-apis.js update`. This
maintenance script can be used to list, show, add, remove and update builtin
API definitions.

##License
The taskcluster client library is released on [MPL 2.0](http://mozilla.org/MPL/2.0/).
