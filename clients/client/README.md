# Taskcluster Client

This client library is generated from the auto-generated API reference.
You can create a Client class from a JSON reference object at runtime using
`taskcluster.createClient(reference)`. But there is also a set of builtin
references from which Client classes are already constructed.

## Calling API End-Points
To invoke an API end-point instantiate a taskcluster Client class, these are
classes can be created from a JSON reference object, but a number of them are
also built-in to this library. The following example instantiates an
instance of the `Queue` Client class, showing all available options, and
uses it to to create a task.  Note that only the `rootUrl` option is required.

```js
var taskcluster = require('taskcluster-client');

// Instantiate the Queue Client class
var queue = new taskcluster.Queue({
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

  // Fake methods, for testing
  fake: null,
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
[taskcluster-lib-pulse](../../libraries/pulse).

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

The set of API entries is generated from the built-in references.
Detailed documentation with description, payload and result format details is
available in the reference section of the Taskcluster documentation.

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

##License
The taskcluster client library is released on [MPL 2.0](http://mozilla.org/MPL/2.0/).
