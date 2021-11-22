# Taskcluster Client for Web

[![Download](https://img.shields.io/badge/yarn-taskcluster--client--web-brightgreen)](https://yarnpkg.com/en/package/taskcluster-client-web)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

**A Taskcluster client library for the browser.**

This library differs from
[taskcluster-client](https://yarnpkg.com/en/package/taskcluster-client) by
providing a version that is compatible with the browser out of the box and does
not require a build step to use.

## Installation

You can install this package using Yarn or npm:

```bash
yarn add taskcluster-client-web
```
```bash
npm install --save taskcluster-client-web
```

## Usage
### Import

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

### Setup

To invoke an API endpoint, instantiate a taskcluster client class.
In the following example we instantiate an instance of the `Queue` client
class.

_Note: while these examples use ES imports, your actual usage will depend on
what your build process or installation method support._

```js
import { Queue } from 'taskcluster-client-web';

const taskId = '...';

// Instantiate the Queue Client class
const queue = new Queue({
  rootUrl: 'https://taskcluster.net',
  timeout: 30 * 1000, // timeout for _each_ individual http request
  credentials: {
    clientId: '...',
    accessToken: '...',
    // Certificate must also be provided if using temporary credentials,
    // this can be either a JSON object or a JSON string.
    certificate: {...} // Only applicable for temporary credentials
  }
});
```

You must configure the `rootUrl` when creating an instance of the client.  The
credentials can also be provided in options. If no credentials are provided,
requests will be made without authentication.

If you need to create a client similar to a existing client, but with some
options changed, use `client.use(options)`:

```js
queue
  .use({ authorizedScopes: [/* ... */] })
  .createTask(/* ... */)
  .then(/* ... */);
```

This replaces any given options with new values.

#### Authorized Scopes

If you wish to perform requests on behalf of a third-party that has a smaller set of
scopes than you do, you can specify which scopes your request should be allowed
to use with `authorizedScopes`. 

```js
import { Queue } from 'taskcluster-client-web';

// Create a Queue Client class can only define tasks for a specific workerType
const queue = new Queue({
  rootUrl,
  // Credentials that can define tasks for any provisioner and workerType.
  credentials: {
    clientId: '...',
    accessToken: '...'
  },
  // Restricting this instance of the Queue client to only one scope
  authorizedScopes: ['queue:post:create-task/my-provisioner/my-worker-type']
});

// This request will only be successful if the task posted is aimed at
// "my-worker-type" under "my-provisioner".
queue
  .createTask(taskId, taskDefinition)
  .then(result => {
    // ...
  });
```



### Calling API Methods

API endpoints are available as async methods on the client object created
above.  The calling conventions are given in the Taskcluster reference
documentation.

```js
// Create task using the queue client
queue
  .createTask(taskId, payload)
  .then((result) => {
    // status is a task status structure
    console.log(result.status);
  });
```

The `payload` parameter is always a JavaScript object as documented by the reference
documentation. 

Some API end-points may take a query string. This is indicated in the signature
as `[options]`. These options are always _optional_, commonly used for
continuation tokens when paging a list.

### Generating URLs

You can build a URL for any request, but this feature is mostly useful for
requests that do not require any authentication. If you need authentication,
take a look at the section on building signed URLs, which is possible for all
`GET` requests. To construct a URL for a request use the `buildUrl` method, as
illustrated in the following example:

```js
import { Queue } from 'taskcluster-client-web';

// Create queue instance
const queue = new Queue({ rootUrl });

// Build url to get a specific task
const url = queue.buildUrl(
  queue.getTask,    // Method to build url for.
  taskId            // First parameter for the method, in this case taskId
);
```

Please note that the `payload` parameter cannot be encoded in URLs and must be
sent when using a constructed URLs. This should not a problem as most methods
that accept a `payload` also require authentication.

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
const queue = new Queue({ rootUrl, credentials });

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

**NOTE**: This method returns a promise, unlike in [taskcluster-client](https://yarnpkg.com/en/package/taskcluster-client).
If you are not using a credentials agent, but have passed `credentials` to the client constructor, you can use the synchronous `buildSignedUrlSync` instead.

Please note that the `payload` parameter cannot be encoded in the signed URL
and must be sent as request payload. This should work fine, just remember that
it's only possible to make signed URLs for `GET` requests, which in most cases
don't accept a payload.

Also please consider using a relatively limited expiration time, as it's not
possible to retract a signed url without revoking your credentials.
For more technical details on signed urls, see _bewit_ URLs in
[hawk](https://github.com/hueniverse/hawk).

### Generating Temporary Credentials

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
### Handling Timestamps

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
### Generating SlugIDs
In Node.js you can rely on the `slugid` module to generate slug IDs, but in the browser we
expose the preferred slug ID generation function as `slugid()`.

```js
import { slugid } from 'taskcluster-client-web';

// Generate new taskId
const taskId = slugid();
```

The generates _nice_ random slug IDs.
### Inspecting Credentials

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

### Credential Agents

This is common server-side when using
[taskcluster-client](https://yarnpkg.com/en/package/taskcluster-client), but
for web applications the credentials are usually acquired through some
user-login process. For such cases, the client uses a `credentialAgent` to get
Taskcluster credentials corresponding to the logged-in user. Agents can be
shared between multiple clients, and are inherited via `.use`.

Any object with an async `getCredentials()` method that returns Taskcluster
credentials is suitable as a credential agent.  The method will be called for
every Client method call, so it should perform some local caching.

## Compatibility

This library is co-versioned with Taskcluster itself.
That is, a client with version x.y.z contains API methods corresponding to Taskcluster version x.y.z.
Taskcluster is careful to maintain API compatibility, and guarantees it within a major version.
That means that any client with version x.* will work against any Taskcluster services at version x.*, and is very likely to work for many other major versions of the Taskcluster services.
Any incompatibilities are noted in the [Changelog](https://github.com/taskcluster/taskcluster/blob/main/CHANGELOG.md).

