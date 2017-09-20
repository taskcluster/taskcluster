# Taskcluster Client Web

**A Taskcluster client library for the browser.**

This client library is generated from the auto-generated API reference. taskcluster-client-web differs from
[taskcluster-client](https://github.com/taskcluster/taskcluster-client) by providing a version that is compatible
with the browser out of the box and does not require a build step to use.

## Installation

You can install this package using Yarn, npm, or include via script tags:

**Yarn installation**

```bash
yarn add taskcluster-client-web
```

**NPM installation**

```bash
npm install --save taskcluster-client-web
```

**Script installation**

```html
<script src="path/to/taskcluster-client-web.js"></script>

<!-- You can also include it from the unpkg CDN -->
<script src="https://unpkg.com/taskcluster-client-web"></script>

<!-- or from the jsDelivr CDN -->
<script src="https://cdn.jsdelivr.net/npm/taskcluster-client-web/lib/index.js"></script>
```

_Note: taskcluster-client-web depends on 2 external packages: hawk and query-string.
You must manually include these if you choose to use the script installation:_

```html
<script src="https://unpkg.com/hawk/lib/browser.js"></script>
<!-- or from the jsDelivr CDN -->
<script src="https://cdn.jsdelivr.net/npm/hawk/dist/browser.js"></script>
<script>
// hawk's "browser" client doesn't expose itself on window
window.hawk = hawk;
</script>
<script src="https://wzrd.in/standalone/query-string"></script>

<script src="https://unpkg.com/taskcluster-client-web"></script>
<!-- or from the jsDelivr CDN -->
<script src="https://cdn.jsdelivr.net/npm/taskcluster-client-web/lib/index.js"></script>
```

## Usage

After installing this package, you can then import functionality as desired. Your specific
build process and installation method will determine how you can import this functionality.
The following importing standards are supported:

**ES imports**

```js
import * as taskcluster from 'taskcluster-client-web';
import { Queue } from 'taskcluster-client-web';
```

**CommonJS require**

```js
const taskcluster = require('taskcluster-client-web');
const { Queue } = require('taskcluster-client-web');
```

**AMD/UMD require**

```js
require(['taskcluster-client-web'], (taskcluster) => {
  // ...
});

require(['taskcluster-client-web'], ({ Queue }) => {
  // ...
});
```

**Global variable from script tag**

```html
<script src="path/to/taskcluster-client-web.js"></script>
<script>
  const taskcluster = window.taskcluster;

  const { Queue } = taskcluster;
</script>
```

## Calling API Endpoints

To invoke an API endpoint, instantiate a taskcluster client class.
In the following example we instantiate an instance of the `Queue` client
class and use it to create a task.

_Note: while these examples use ES imports, your actual usage will depend on
what your build process or installation method support._

```js
import { Queue } from 'taskcluster-client-web';

const taskId = '...';

// Instantiate the Queue Client class
const queue = new Queue({
  timeout: 30 * 1000, // timeout for _each_ individual http request
  credentials: {
    clientId: '...',
    accessToken: '...',
    // Certificate must also be provided if using temporary credentials,
    // this can be either a JSON object or a JSON string.
    certificate: {...} // Only applicable for temporary credentials
  }
});

// Create task using the queue client
queue
  .createTask(taskId, payload)
  .then((result) => {
    // status is a task status structure
    console.log(result.status);
  });
```

The `payload` parameter is always a JavaScript object as documented by the REST API
documentation. The methods always returns a _promise_ for the response JSON
object as documented in the REST API documentation. If you have JavaScript Async Function
support, you can also `await` these methods.

If you need to create a client similar to a existing client, but with some
options changed, use `client.use(options)`:

```js
queue
  .use({ authorizedScopes: [/* ... */] })
  .createTask(/* ... */)
  .then(/* ... */);
```

This replaces any given options with new values.


### Web Listener

Listening to Pulse Events can be done using a `WebListener`. The WebListener will
connect to `events.taskcluster.net` using a WebSocket.

```js
import { WebListener } from 'taskcluster-client-web';

const listener = new WebListener({
  baseUrl: 'wss://host' // defaults to: wss://events.taskcluster.net/v1
});
```

## Documentation

Documentation for the set of API entries is generated from the built-in references,
and is listed in the [`docs` directory](/docs) of this repository.
Detailed documentation with description, payload, and result format details is
available on [docs.taskcluster.net](http://docs.taskcluster.net).

## Providing Options

Some API end-points may take a query string. This is indicated in the signature
as `[options]`. These options are always _optional_, commonly used for
continuation tokens when paging a list. For a list of supported options,
consult the API documentation on `docs.taskcluster.net`.

## Construct URLs

You can build a URL for any request, but this feature is mostly useful for
requests that do not require any authentication. If you need authentication,
take a look at the section on building signed URLs, which is possible for all
`GET` requests. To construct a URL for a request use the `buildUrl` method, as
illustrated in the following example:

```js
import { Queue } from 'taskcluster-client-web';

// Create queue instance
const queue = new Queue();

// Build url to get a specific task
const url = queue.buildUrl(
  queue.getTask,    // Method to build url for.
  taskId            // First parameter for the method, in this case taskId
);
```

Please note that the `payload` parameter cannot be encoded in URLs and must be
sent when using a constructed URLs. This should not a problem as most methods
that accept a `payload` also require authentication.


## Construct Signed URLs

It's possible to build signed URLs for `GET` requests. A signed URL
contains a query string parameter called `bewit`. This parameter holds
expiration time, signature, and scope restrictions if applied. The signature
covers the following parameters:

* Expiration time,
* URL and query string
* Scope restrictions, if applied

These signed URLs are convenient if you want to grant someone access to a
specific resource without proxying the request or sharing your credentials.
It's fairly safe to provide someone with a signed URL for a
specific artifact that is protected by a scope, for example:

```js
import { Queue } from 'taskcluster-client-web';

// Create queue instance
const queue = new Queue({ credentials });

// Build signed url
const signedUrl = queue.buildSignedUrl(
  queue.getArtifactFromRun, // method to build signed url for.
  taskId, // Task ID parameter
  runId, // Run ID parameter
  artifactName, // Artifact name parameter
  { expiration: 60 * 10 }  // Expiration time in seconds
);
```

Please note that the `payload` parameter cannot be encoded in the signed URL
and must be sent as request payload. This should work fine, just remember that
it's only possible to make signed URLs for `GET` requests, which in most cases
don't accept a payload.

Also please consider using a relatively limited expiration time, as it's not
possible to retract a signed url without revoking your credentials.
For more technical details on signed urls, see _bewit_ URLs in
[hawk](https://github.com/hueniverse/hawk).

## Generating Temporary Credentials

If you have non-temporary Taskcluster credentials you can generate a set of
temporary credentials as follows. Notice that the credentials cannot last more
than 31 days, and you can only revoke them by revoking the credentials that were
used to issue them, which can take up to one hour.

```js
import { createTemporaryCredentials } from 'taskcluster-client-web';

const credentials = createTemporaryCredentials({
  // Name of temporary credential (optional)
  clientId: '...',
  // Validity of temporary credentials starts here
  start: new Date(),
  // Expiration of temporary credentials
  expiry: new Date(new Date().getTime() + 5 * 60 * 1000),
  // Scopes to grant the temporary credentials
  scopes: ['ScopeA', 'ScopeB', /* ... */],
  credentials: { // Non-temporary taskcluster credentials
    clientId: '...',
    accessToken: '...'
  }
});
```

You cannot use temporary credentials to issue new temporary credentials. You
must have `auth:create-client:<name>` to create a named temporary credential,
but unnamed temporary credentials can be created regardless of your scopes.

## Configuration of API Invocations

There are a number of configuration options for clients which affect invocation
of API endpoints. These are useful if using a non-default server, e.g.
when setting up a staging area or testing locally.

### Configuring API Base URLs

If you use the built-in API client classes, you can configure
the `baseUrl` when creating an instance of the client. As illustrated below:

```js
import { Auth } from 'taskcluster-client-web';

const auth = new Auth({
  credentials: { /* ... */ },
  baseUrl: 'http://localhost:4040' // Useful for development and testing
});
```

### Configuring Credentials

When creating an instance of a client class, the credentials can be provided
in options. For example:

```js
import { Auth } from 'taskcluster-client-web';

const auth = new Auth({
  credentials: {
    clientId: '...',
    accessToken: '...'
  }
});
```

You may also choose to pass an access token from a Taskcluster-Login-supported authentication service,
e.g. auth0. Passing an access token will cause the client instance to remotely fetch the associated
credentials, which will then be filled in as options just as though they had been passed directly to
the client constructor. Calling any methods on the client instance will wait for the credentials exchange
to complete before being submitted.

```js
import { Queue } from 'taskcluster-client-web';

const queue = new Queue({
  accessToken: '<e.g. auth0 access token>'
});

queue
  .createTask(/* ... */)
  .then(/* ... */);
```

Passing an access token to the client constructor has the added benefit of automatically fetching
new credentials when the existing credentials expire, up until the access token's valid duration.

_Note: Using an authentication access token instead of credentials will cause a network request to occur
to fetch credentials every time a client class is created. For the sake of efficiency, you should try to
limit the creation of client classes to minimize this impact and reuse the client instances as much as
possible within your application._

### Restricting Authorized Scopes

If you wish to perform requests on behalf of a third-party that has a smaller set of
scopes than you do, you can specify which scopes your request should be allowed
to use with `authorizedScopes`. This is useful when the scheduler
performs a request on behalf of a task group, or when authentication takes
place in a trusted proxy. For example:

```js
import { Queue } from 'taskcluster-client-web';

// Create a Queue Client class can only define tasks for a specific workerType
const queue = new Queue({
  // Credentials that can define tasks for any provisioner and workerType.
  credentials: {
    clientId: '...',
    accessToken: '...'
  },
  // Restricting this instance of the Queue client to only one scope
  authorizedScopes: ['queue:post:define-task/my-provisioner/my-worker-type']
});

// This request will only be successful if the task posted is aimed at
// "my-worker-type" under "my-provisioner".
queue
  .defineTask(taskId, taskDefinition)
  .then(result => {
    // ...
  });
```


## Configuration of Exchange Bindings

When a taskcluster client class is instantiated, the option `exchangePrefix` may
be given. This will replace the default `exchangePrefix`. This can be useful if
deploying a staging area or similar. For example:

```js
import { QueueEvents } from 'taskcluster-client-web';

// Instantiate the QueueEvents Client class
const queueEvents = new QueueEvents({
  exchangePrefix: 'staging-queue/v1/'
});

// This listener will now bind to: staging-queue/v1/task-completed
listener.bind(queueEvents.taskCompleted({ taskId: '<myTaskId>' }));
```

## Relative Date-Time Utilities

Many Taskcluster APIs require ISO 8601 timestamp offsets into the future
as way of providing expiration, deadlines, etc. These can be easily created
using `new Date().toJSON()`, however, it can be rather error prone and tedious
to offset `Date` objects into the future. Therefore this library comes with two
utility functions for this purpose.

```js
import { fromNow, fromNowJSON } from 'taskcluster-client-web';

const dateObject = fromNow('2 days 3 hours 1 minute');
const dateString = fromNowJSON('2 days 3 hours 1 minute');

(dateObject.toJSON() === dateString)
// dateObject = now() + 2 days 2 hours and 1 minute
(new Date().getTime() < dateObject.getTime())
```

By default it will offset the datetime into the future. If the offset strings
are minus-prefixed (`-`), the date object will be offset into the past. This is
useful in some corner cases.

```js
import { fromNow } from 'taskcluster-client-web';

const dateObject = fromNow('- 1 year 2 months 3 weeks 5 seconds');

// dateObject = now() - 1 year, 2 months, 3 weeks and 5 seconds
(new Date().getTime() > dateObject.getTime())
```

The offset string is ignorant of whitespace and case-insensitive. It may also
optionally be plus-prefixed `+`, if not minus-prefixed. Any `+` prefix will be
ignored. However, entries in the offset string must be given in order from
highest to lowest, e.g. `2 years 1 day`. Additionally, various shorthands may be
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

The `fromNow` function may also be given a date to be relative to as a second
argument. This is useful if offsetting the task expiration relative to the the task
deadline or doing something similar.

```js
import { fromNow } from 'taskcluster-client-web';

const dateObject1 = fromNow('2 days 3 hours');
// dateObject1 = now() + 2 days and 3 hours

const dateObject2 = fromNow('1 year', dateObject1);
// dateObject2 = now() + 1 year, 2 days and 3 hours
```

## Handling Credentials

Your users may find the options for Taskcluster credentials overwhelming. You
can help by interpreting the credentials for them.

The `credentialInformation(credentials, options)` function returns a Promise
with information about the given credentials:

```js
{
   clientId: '..', // name of the credential
   type: '..', // type of credential, e.g., "temporary"
   active: '..', // active (valid, not disabled, etc.)
   start: '..', // validity start time (if applicable)
   expiry: '..', // validity end time (if applicable)
   scopes: ['...'] // associated scopes (if available)
}
```

The resulting information should *only* be used for presentation purposes, and
never for access control. This function may fail unexpectedly with invalid
credentials and performs no cryptographic checks. It is acceptable to use the
scopes result to determine whether to display UI elements associated with a
particular scope, as long as the underlying API performs more reliable
authorization checks.

## Generating slug IDs

In Node.js you can rely on the `slugid` module to generate slug IDs, but in the browser we
expose the preferred slug ID generation function as `slugid()`.

```js
import { slugid } from 'taskcluster-client-web';

// Generate new taskId
const taskId = slugid();
```

The generates _nice_ random slug IDs.

## Updating Built-In APIs

When releasing a new version of `taskcluster-client-web` library, you should
always re-build the project using `yarn build`. There are also
several other scripts for maintenance:

- `yarn update-all`: Pull the latest API manifest, re-build the package, and update all documentation.
- `yarn build`: Re-build the library for distribution.
- `yarn docs`: Generate the API documentation Markdown files from the API reference.
- `yarn compile-clients`: Pull the latest API manifest from the schema endpoint and re-create the client classes.
- `yarn list-clients`: Print a list of client APIs built into taskcluster-client-web based on the API reference.
- `yarn show-client <client>`: Print the detailed schema information for a particular client, e.g. `yarm show Auth`.
- `yarn test`: Run the test suites.

## License

taskcluster-client-web is released as [MPL 2.0](http://mozilla.org/MPL/2.0/).
