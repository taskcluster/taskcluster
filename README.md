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

Many Taskcluster components publish messages about current events to Pulse. The JSON
reference object also contains metadata about declared Pulse exchanges and their routing
key construction. This is designed to make it easy to construct routing key patterns and
parse routing keys from incoming messages.

The following example creates a listener by creating a `WebListener`, as well as creating
a `QueueEvents` instance which we use to find the exchange and create a routing pattern to
listen for the completion of a specific task. The `taskCompleted` method will construct
a routing key pattern by using `*` or `#` for missing entries, depending on whether or not
they are single-word or multi-key entries.

By default the `WebListener` will connect to `events.taskcluster.net` using a WebSocket.

```js
import { QueueEvents, WebListener } from 'taskcluster-client-web';

const queueEvents = new QueueEvents();
const listener = new WebListener({
  credentials: {
    username: '...', // Pulse username from pulse guardian
    password: '...' // Pulse password from pulse guardian
  }
});

// This binds to taskCompleted events from the queue
// that match routing key pattern:
// 'primary.<myTaskId>.*.*.*.*.*.#'
listener.bind(queueEvents.taskCompleted({ taskId: '<myTaskId>' }));

// Create an event handler to react to messages
listener.on('message', (message) => {
  message.exchange; // Exchange from which message came
  message.payload; // Documented on docs.taskcluster.net
  message.routingKey; // Message routing key in string format
  message.routing.taskId; // Element from parsed routing key
  message.routing.runId; // ...
  message.redelivered; // True if message has been nack'ed and requeued
  message.routes; // List of CC'ed routes, without the `route.` prefix
});

// Connect the listener
listener
  .connect()
  .then(() => {
    // Listener is connected and listening for messages)
  })
```

To bind to a custom routing-key like the task-specific routes that messages from
the queue are CC'ed to, just provide the desired routing key to the method for
exchange.

```js
const rawRoutingPattern = 'route.task.specific.routing.key';

listener.bind(queueEvents.taskCompleted(rawRoutingPattern));
```

The `WebListener` accepts a few options for modifying its operation:

```js
new WebListener({
  // This is the default value
  baseUrl: 'wss://events.taskcluster.net/v1',
  
  // By default the WebSocket will attempt to
  // reconnect every 5 seconds in case of disconnection
  reconnectInterval: 5000
})
```

The `WebListener` emits several events which can be reacted to using the `on` method:

```js
listener.on(eventName, handler)
```

The `handler` is a function to be invoked every time a particular `eventName` event occurs, and can
receive a JSON-parsed payload or error as an argument.

The `eventName` should correspond to one of the possible events the listener emits:

| `event` | Description |
| --- | --- |
| `ready` | A socket connection has been established and can start transmitting messages. |
| `message` | A message has been received from the service. The message will be parsed from JSON or be null and provided to the event handler. |
| `bind` | The service has accepted a request to respond to a routing pattern. The response will be parsed from JSON or be null and provided to the event handler. |
| `error` | A problem occurred while connecting or receiving a message. Can return metadata about the error or an `Error` instance to the event handler. |
| `close` | The socket was disconnected. May occur more than once to account for reconnects. |
| `reconnect` | The socket was re-connected after experiencing a `close`. |

The return value of `on()` is a function which can be used to automatically unbind the event.

```js
const removeListener = listener.on('close', () => console.log('CLOSED!'));

// ...

removeListener(); // The previous close event is no longer bound
```

You may also use the `off()` method to manually unbind a handler from an event.

```js
const handleClose = () => console.log('CLOSE!');

listener.on('close', handleClose);

// ...

listener.off('close', handleClose);
```

The unbinding can also be done internally to the handler that is bound, allowing a
handler to unbind itself if necessary. The easiest technique for doing this is to
use a named function expression:

```js
listener.on('close', function handler() {
  listener.off('close', handler);
  // ...
});
```

Once the `WebListener` has established a connection, it will check every 5
seconds to ensure the listener is still connected. To make the listener close
its connect and halt reconnection attempts, call `close()`.

```js
const listener = new WebListener();

// ...

listener
  .close()
  .then(() => {
    // listener has disconnected and will not attempt
    // to reconnect
  });
```

For convenience, there are also some methods to determine the status of the socket connection:

```js
const listener = new WebListener();

// This will return a Boolean based on whether the socket connection is in the OPEN state.
listener.isOpen();

// This will return a Boolean based on whether the socket connection is currently connected.
listener.isConnected();
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
queue
  .buildSignedUrl(
    queue.getArtifactFromRun, // method to build signed url for.
    taskId, // Task ID parameter
    runId, // Run ID parameter
    artifactName, // Artifact name parameter
    { expiration: 60 * 10 }  // Expiration time in seconds
  )
  .then(signedUrl => { /* ... });
```

**NOTE**: This method returns a promise, unlike in taskcluster-client.

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

This is common server-side when using
[taskcluster-client](https://github.com/taskcluster/taskcluster-client), but
for web applications the credentials are usually acquired through some
user-login process. For such cases, the client uses a `credentialAgent` to get
Taskcluster credentials corresponding to the logged-in user. Agents can be
shared between multiple clients, and are inherited via `.use`.

#### OIDCCredentialAgent

[Taskcluster-Login](https://docs.taskcluster.net/reference/integrations/taskcluster-login/docs/getting-user-creds)
provides Taskcluster credentials in exchange for an OIDC `access_token`. To use
this functionality, construct an `OIDCCredentialAgent` and pass it to the
client. This agent will automatically fetch credentials as needed.

```js
import { Queue, OIDCCredentialAgent } from 'taskcluster-client-web';

const credentialAgent = new OIDCCredentialAgent({
  accessToken: '...',
  oidcProvider: 'mozilla-auth0',
});

const queue = new Queue({ credentialAgent });

queue
  .createTask(/* ... */)
  .then(/* ... */);
```

To get credentials from the agent, call its `getCredentials` method:

```js
let credentials = await credentialAgent.getCredentials()
```

When the access token is refreshed, simply update it on the credential agent:

```js
credentialAgent.accessToken = newAccessToken;
```

#### Other Credential Agents

Any object with an async `getCredentials()` method that returns Taskcluster
credentials is suitable as a credential agent.  The method will be called for
every Client method call, so it should perform some local caching.

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
- `yarn show-client <client>`: Print the detailed schema information for a particular client, e.g. `yarn show Auth`.
- `yarn test`: Run the test suites.
- `yarn lint`: Manually lint the source code of the repo.

## License

taskcluster-client-web is released as [MPL 2.0](http://mozilla.org/MPL/2.0/).
