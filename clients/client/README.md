# Taskcluster Client for JS

[![Download](https://img.shields.io/badge/yarn-taskcluster--client-brightgreen)](https://yarnpkg.com/en/package/taskcluster-client)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

**A Taskcluster client library for (server-side) JS.**

This library is a complete interface to Taskcluster in JavaScript.  It provides
an asynchronous interface for all Taskcluster API methods.  This library is
used within Taskcluster itself for inter-service communication.

## Usage

For a general guide to using Taskcluster clients, see [Calling Taskcluster APIs](https://docs.taskcluster.net/docs/manual/using/api).

### Setup

Before calling an API end-point, you'll need to create a client instance.
There is a class for each service, e.g., `Queue` and `Auth`.  Each takes the
same options, shown in the example below.  Note that only `rootUrl` is
required, and it's unusual to configure any other options aside from
`credentials`.

```js
const taskcluster = require('taskcluster-client');

// Instantiate the Queue Client class
const queue = new taskcluster.Queue({
  // rootUrl for this Taskcluster instance (required)
  rootUrl: 'https://taskcluster.myproject.org',

  // Taskcluster credentials (required only for API methods that require scopes)
  credentials: {
    clientId:     '...',
    accessToken:  '...',
    // Certificate must also be provided if using temporary credentials,
    // this can be either a JSON object or a JSON string.
    certificate:  {...}   // Only applicable for temporary credentials
  }

  // timeout for _each_ invidual http request
  timeout: 30 * 1000,

  // maximum number of retries for transient errors (default 5)
  retries: 5,

  // Multiplier for computation of retry delay: 2 ^ retry * delayFactor,
  // 100 ms is solid for servers, and 500ms - 1s is suitable for background
  // processes
  delayFactor: 100,

  // Randomization factor added as.
  // delay = delay * random([1 - randomizationFactor; 1 + randomizationFactor])
  randomizationFactor: 0.25,

  // Maximum retry delay (defaults to 30 seconds)
  maxDelay: 30 * 1000,

  // By default we share a global HTTP agent. If you specify one, your instance
  // will have its own agent with the given options...
  agent: undefined,

  // Fake methods, for testing (see below)
  fake: null,

  // authorized scopes for use in requests by this client
  authorizedScopes: undefined,

  // (optional) If set, this will be added to requests as a `x-taskcluster-trace-id` header
  traceId: undefined

  // (optional) This supports different ways of finding Taskcluster services. Currently only
  //            values are `default` and `k8s-dns`. The latter of which is for Taskcluster
  //            internal use only.
  serviceDiscoveryScheme: 'default'
});
```

If you need to create a client similar to a existing client, but with some
options changed, use `client.use(options)`:

```js
queue
  .use({retries: 0}) // disable retries for this request
  .createTask(..)
  .then(..);
```

This replaces any given options with new values. For `traceId` in particular, you can use

```js
queue.taskclusterPerRequestInstance({traceId});
```

Which is a special interface mostly useful for Taskcluster internal use.

#### Authentication Options

You can automatically read credentials and rootUrl from the standard `TASKCLUSTER_…`
[environment
variables](https://docs.taskcluster.net/docs/manual/design/env-vars) with
`taskcluster.fromEnvVars()` with `fromEnvVars`:

```js
const auth = new taskcluster.Auth({
  ...taskcluster.fromEnvVars(),
});
```

Note that this function does not respect `TASKCLUSTER_PROXY_URL`.  To use the Taskcluster Proxy from within a task:

```js
const auth = new taskcluster.Auth({
  rootUrl: process.env.TASKCLUSTER_PROXY_URL,
});
```

You may also provide credentials directly. For example:
```js
const auth = new taskcluster.Auth({
  credentials: {
    clientId:     '...',
    accessToken:  '...'
  }
});
```
If the `clientId` and `accessToken` are not given, no credentials will be used.

#### Global Configuration

You can set any of these values as global configuration options:

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
const auth = new taskcluster.Auth();
```

#### Authorized Scopes

If you wish to perform requests on behalf of a third-party that has small set
of scopes than you do. You can specify [which scopes your request should be
allowed to
use](https://docs.taskcluster.net/docs/manual/design/apis/hawk/authorized-scopes),
in the `authorizedScopes` option.  See example below:

```js
// Create a Queue Client class can only define tasks for a specific workerType
const queue = new taskcluster.Queue({
  // Credentials that can define tasks for any provisioner and workerType.
  credentials: {
    clientId:       '...',
    accessToken:    '...'
  },
  // Restricting this instance of the Queue client to only one scope
  authorizedScopes: ['queue:create-task:highest:my-provisioner/my-worker-type']
});

// This request will only be successful, if the task posted is aimed at
// "my-worker-type/my-provisioner".
await queue.createTask(taskId taskDefinition).then(function(result) {
  // ...
});
```

### Calling API Methods

Once you have a client object, calling API methods is as simple as invoking a
method on the object.  All API methods are async, and their function signatures
match those in the reference documentation.  In general, URL arguments are
positional JS arguments, and any request payload is provided in a JSON object
in the final argument.

Some API end-points may take query-string options.  This is indicated in the
signature in the reference documentation as `[options]`. These options are
always _optional_, commonly used for continuation tokens when paging a list.

```js
// Create task using the queue client
const taskId = '...';
const result = await queue.createTask(taskId, payload);
console.log(result.status);
});
```

### Generating URLs (Internal and External)

For the following section, there are 2 internal and 2 external functions. The
external functions should be used when a built url is leaving the deployment. One
example would be when it results in a redirect to an artifact for users. This distinction
is only important when using a non-default service discovery scheme; with the default
scheme, internal and external functions behave the same.

|          | Unsigned           | Signed                   |
| Internal | `buildUrl`         | `buildSignedUrl`         |
| External | `externalBuildUrl` | `externalBuildSignedUrl` |

You can build a URL for any API method, although this feature is
mostly useful for request that don't require any authentication. To construct a
url for a request use the `buildUrl`/`externalBuildUrl` method, as illustrated in the following
example:

```js
// Create queue instance
const queue = new taskcluster.Queue(...);

// Build url to get a specific task
const url = queue.buildUrl(
  queue.getTask,    // Method to build url for.
  taskId            // First parameter for the method, in this case taskId
);
```

It's possible to build signed URLs, including authentication information, for
all `GET` requests. A signed url contains a query-string parameter called
`bewit`, this parameter holds expiration time, signature and scope restrictions
(if applied). The signature covers the following parameters:

  * Expiration time,
  * Url and query-string, and
  * scope restrictions (if applied)

These signed urls are very convenient if you want to grant somebody access to
specific resource without proxying the request or sharing your credentials.
For example it's fairly safe to provide someone with a signed url for a
specific artifact that is protected by a scope. See example below.

```js
// Create queue instance
const queue = new taskcluster.Queue(...);

// Build signed url
const signedUrl = queue.buildSignedUrl(
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
[@hapi/hawk](https://github.com/hapijs/hawk).

### Generating Temporary Credentials

If you have non-temporary taskcluster credentials you can generate a set of
[temporary credentials](https://docs.taskcluster.net/docs/manual/design/apis/hawk/temporary-credentials) as follows. Notice that the credentials cannot last more
than 31 days, and you can only revoke them by revoking the credentials that was
used to issue them (this takes up to one hour).

```js
const credentials = taskcluster.createTemporaryCredentials({
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

### Handling Timestamps

A lot of taskcluster APIs requires ISO 8601 time stamps offset into the future
as way of providing expiration, deadlines, etc. These can be easily created
using `new Date().toJSON()`, however, it can be rather error prone and tedious
to offset `Date` objects into the future. Therefore this library comes with two
utility functions for this purposes.

```js
const dateObject = taskcluster.fromNow("2 days 3 hours 1 minute");
const dateString = taskcluster.fromNowJSON("2 days 3 hours 1 minute");
assert(dateObject.toJSON() === dateString);
// dateObject = now() + 2 days 2 hours and 1 minute
assert(new Date().getTime() < dateObject.getTime());
```

By default it will offset the date time into the future, if the offset strings
are prefixed minus (`-`) the date object will be offset into the past. This is
useful in some corner cases.

```js
const dateObject = taskcluster.fromNow("- 1 year 2 months 3 weeks 5 seconds");
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
const dateObject1 = taskcluster.fromNow("2 days 3 hours");
// dateObject1  = now() + 2 days and 3 hours
const dateObject2 = taskcluster.fromNow("1 year", dateObject1);
// dateObject2  = now() + 1 year, 2 days and 3 hours
```

### Generating SlugIDs

In node you can rely on the `slugid` module to generate slugids, but we already
need it in `taskcluster-client` and expose the preferred slugid generation
function as `taskcluster.slugid()`.

```js
const taskcluster = require('taskcluster-client');

// Generate new taskId
const taskId = taskcluster.slugid();
```

The generates _nice_ random slugids, refer to slugid module for further details.

### Inspecting Credentials

Your users may find the options for Taskcluster credentials overwhelming.  You
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

### Listening for Events

**NOTE** `PulseListener` is no longer included in `taskcluster-client`;
instead, use `PulseConsumer` from
[taskcluster-lib-pulse](../../libraries/pulse).

However, this library helpfully includes bindings for exchanges declared by
various Taskcluster services.  To use these with `taskcluster-lib-pulse`,
create an `..Events` instance, call the apprporiate methods on it to construct
a binding, and pass that to `pulse.consume`:

```js
const taskcluster = require('taskcluster-client');

// Instantiate the QueueEvents Client class
const queueEvents = new taskcluster.QueueEvents({rootUrl: ..});

let pc = await pulse.consume({
  bindings: [
    // Bind to task-completed events from queue that matches routing key pattern:
    //   'primary.<myTaskId>.*.*.*.*.*.#'
    queueEvents.taskCompleted({taskId: myTaskId});
  ], ..);
```

### Fake API Methods

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
### Creating Client Classes Dynamically

You can create a Client class from a reference JSON object as illustrated
below.  This is unusual, as generally the latest version of the library
contains pre-defined classes for all Taskcluster services.

```js
const reference = {...}; // JSON from <rootUrl>/references/<serviceName>/<apiVersion>/api.json

// Create Client class
const MyClient = taskcluster.createClient(reference);

// Instantiate an instance of MyClient
const myClient = new MyClient(options);

// Make a request with a method on myClient
myClient.myMethod(arg1, arg2, payload).then(function(result) {
  // ...
});
```

### Internal Service Discovery

To allow for more efficient routing between Taskcluster services running alongside each other in
a Kubernetes cluster, this library has configurable support for using
[DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/). To
configure this on all clients created from this library, use `taskcluster.setServiceDiscoveryScheme('k8s-dns')`.
To configure this for an instantiation of a client class **or to override the setting back to default** you
can `new taskcluster.Auth({..., serviceDiscoveryScheme: 'k8s-dns'});`. The value for default behavior is `default`.

## Compatibility

This library is co-versioned with Taskcluster itself.
That is, a client with version x.y.z contains API methods corresponding to Taskcluster version x.y.z.
Taskcluster is careful to maintain API compatibility, and guarantees it within a major version.
That means that any client with version x.* will work against any Taskcluster services at version x.*, and is very likely to work for many other major versions of the Taskcluster services.
Any incompatibilities are noted in the [Changelog](https://github.com/taskcluster/taskcluster/blob/master/CHANGELOG.md).


