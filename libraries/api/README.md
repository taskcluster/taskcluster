TaskCluster API
===============

This library provides support for building an API for a TaskCluster
microservice.  It consists of some abstractions over `express` for declaring
APIs with reference formats that enables automatic documentation, authorization
checking, and generation of client libraries.

## Quick example

```js
let API = require('taskcluster-lib-api');

// First declare an API
let api = new API({
  // Title and description for docs
  title: 'My API',
  name: 'my-api', // Must match /^[a-z][a-z0-9_-]*$/
  description: [
    "Long string with **markdown** support, used for writing docs",
    "typically written using [].join('\n') to allow for long strings"
  ].join('\n'),

  // Patterns for common URL parameters
  params: {
    userId: /^[a-z0-9]+$/
  },

  // Prefix for all schema referenced
  schemaPrefix: 'http://myschema-site.com/folder/',

  // List of properties required as context in api.router(...)
  // provided as `this` context to handlers
  context: ['myDataStore']
});

// Now declare an API method
api.declare({
  method: 'get',
  route:  '/:userId',
  name:   'getUser',
  output: 'my-user-schema.json',
  title:  "Get a user",
  description: "Long description... in **markdown**..."
}, async function(req, res) {
  let user = await this.myDataStore.find(req.params.userId);
  res.reply({
    data: "in compliance with schema",
  });
});


// Now create an express router
let router = api.setup({
  context: {
    myDataStore:      new DataStore(),
  },
  validator:          new base.validator(),
});

// Add to express app
app.use(router);
```

## Declaring APIs

To declare an API, create a new `API` object:

```js
const API = require('taskcluster-lib-api');
let api = new API({
  // ..options..
});
```
The available options are:

 * `title` (required) - the title of the API (the microservice name)
 * `description` (required) - a description of the service, treated as markdown
 * `name` (required) - a simple name for the service that will become part of a url
   This must match the regex `/^[a-z][a-z0-9_-]*$/`. It will be the following part of a url:
   `https://whatever.net/api/<name>/v1/endpoint`.
 * `schemaPrefix` - the prefix for the schema definitions for this service
 * `params` - patterns for URL parameters that apply to all methods (see below)
 * `context` - a list of context entries that must be passed to `api.setup`.  Each
   will be available as properties of `this` within the implementation of each API
   method.
 * `errorCodes` - a mapping from error names to HTTP statuses, e.g., `{MyError: 400}`

## Declaring methods

To declare an API method, call `api.declare(options, handler)` with the following options.

 * `name` (required) - identifier with which the method can be called from client
   libraries (camelCase)
 * `title` (required) - short title of the API method
 * `description` (required) - detailed description / documentation of the method, in markdwon
 * `method` (required) - the HTTP method used to invoke this method, lower-cased, e.g., `"post"`
 * `route` (required) - the URL pattern, with parameters, e.g., `'/object/:id/action/:param'`
 * `params` - patterns for URL parameters (see below)
 * `query` - patterns for query parameters (see below)
 * `scopes` - scopes required for this API endpoint, in 'scope expression' form (see below)
 * `stability` - API stability level, defaulting to experimental (see below)
 * `input` - the schema against which the input payload will be validated
 * `skipInputValidation` - if true, don't do input validation (but include the schema in documentation)
 * `output` - the schema against which the output payload will be validated
 * `skipOutputValidation` - if true, don't do output validation (but include the schema in documentation)
 * `cleanPayload` - a function taking and returning a payload, which will "clean" any values that should
   not appear in error messages (for example, removing secrets)

The `handler` parameter is a normal Express request handler, with some extra
features; see "Request Handlers" below.

### Parameters and Queries

Both URL parameters (appearing as `../:paramName/..` in the route) and query
parameters (which the user supplies after a `?` in the URL) can be validated
using the `params` and `query` options, which have the same form.  In
particular, you may supply a regular expression which the value must match, or
a function taking the value and returning a message if it is invalid.
Examples:

```js
  params: {
    thingId: /[a-z.]+/,
    filter: v => {
      if (!validFilterExpression(v)) {
        return "invalid filter expression";
      }
    },
  }
```

### Scopes

Scopes should be specified in
[scope expression form](https://github.com/taskcluster/taskcluster-lib-scopes#new-style).
Parameters are substituted into scopes with `<paramName>`
syntax.  For example, the following definition allows the method when *either*
the caller's scopes satisfy `queue:create-task..` for the given `provisionerId`
and `workerType`, *or* the caller's scopes satisfy all of
`queue:define-task:..`, `queue:task-group-id:..`, and `queue:schedule-task:..`.

```js
  scopes:
    {AnyOf: [
      {AllOf: [
        'queue:create-task:<provisionerId>/<workerType>',
      ]},
      {AllOf: [
        'queue:define-task:<provisionerId>/<workerType>',
        'queue:task-group-id:<schedulerId>/<taskGroupId>',
        'queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>',
      ]},
    ]},
```

If scope validation fails, the user is presented with an extensive error
message indicating the available and required scopes.

Given an array of parameters, an array of scopes can be templated. When
this form is used, the parameter in the `in` section must be an array. The
value of `each` *must* be a simple template string and cannot be a scope
expression or another template object. This will not allow recursive
definitions.

```js
  scopes: {AllOf: [
    {for: 'route', in: 'routes', each: 'queue:route:<route>'}
  ]}
```

Given a parameter `routes` that is an array of strings as in `['foo', 'bar']`,
this will evaluate to:

```js
  scopes: {AllOf: ['queue:route:foo', 'queue:route:bar']}
```

You may also use if/then constructs in scope expressions. In this case, the `if`
field should be a parameter and the `then` must be a scope expression that will
be substituted in for the if/then block if the `if` parameter is a boolean and is true.
This will not do any truthiness conversions, you must do that yourself if desired.
Given the following example:

```js
  scopes: {if: 'private', then: {AllOf: ['foo:bar']}}
```

We can call `async req.authorize({private: false})` and the method call will be permitted
even if the client does not have the scope `foo:bar`.

The if/then constructs can also have an optional `else` branch, in the following
example the parameter `isReadOnly` determines which of the two branches must be
satisfied.

```js
  scopes: {
    if: 'isReadOnly',
    then: {AnyOf: ['read-only', 'read-write']},
    else: {AnyOf: ['read-write']},
  }
```

When you specify scopes required to access an endpoint, by default all of the params
specified in the `params` section of the request will be substituted in and the expression
satisfaction will be checked against the client's scopes. If any of the parameters specified in
your scopes are _not_ in the `params`, this satisfaction check will be deferred and the
endpoint implementation _must_ check for authorization manually as described below. If
this check does not occur, taskcluster-lib-api will throw an error for the result of the
endpoint.

### Stability Levels

The API stability levels are available as properties of `API.stability`:

*`API.stability.experimental`*

Unless otherwise stated, experimental interfaces may change and resources may
be deleted without warning. Often we will, however, try to deprecate the API
first and keep it around, just marked `deprecated`.

Intended Usage:

 * Prototype API end-points,
 * API end-points intended displaying unimportant state.
   (e.g. API to fetch state from a provisioner)
 * Prototypes used in non-critical production by third parties,
 * API end-points of little public interest,
   (e.g. API to define workerTypes for a provisioner)

Generally, this is a good stability level for anything under-development, or
when we know that there is a limited number of consumers so fixing the world
after breaking the API is easy.

*`API.stability.stable`*

Indicates that the API method is stable and we will not delete resources or
break the API suddenly.  As a guideline we will always facilitate gradual
migration if we change a stable API.

Intended Usage:

 * API end-points used in critical production.
 * APIs so widely used that refactoring would be hard.

*`API.stability.deprecated`*

Indicates that the API method has been marked for deprecation and should not be
used in new clients.

*Note:* the documentation string for a deprecated API end-point should outline
the deprecation strategy.

## Request Handlers

The `handler` argument to ``api.declare`` is a "normal" Express handler, taking
arguments `(req, res)`.  The function can be async (return a Promise).

Parameters are available as properties of `req.params`, with query parameters
available on `req.query`.  The decoded and validated request payload is in
`req.body`.

The request object has a few extra properties relevant to authentication and
authorization.  First, `req.clientId()` returns, via Promise, the clientId of
the caller, or some reason the clientId is not known (`auth-failed:status`).
Note that clientIds may be used for convenience and display, but not as a basis
for access control; that's what scopes are for.

Speaking of which, `req.scopes()` returns, via a Promise, the set of scopes
associated with the caller.  It returns `[]` if there is an authentication
error.

If authentication was successful, `req.expires()` returns (via Promise) the
expiration time of the credentials used to make this request.  If the response
includes some additional security token, its duration should be limited to this
expiration time to prevent callers from extending their access beyond the
allowed time.

The `async req.authorize(params, options)` throws an error with the code
'AuthorizationError' if the client does not satisfy the scope
expression in `options.scopes`. You can catch this if you wish
or let it bubble up and taskcluster-lib-api will return a detailed error message
to the client.

The AuthorizationError has 3 extra fields to help inspect the results.

**err.scopes:** The scopeset containing the scopes the client has
**err.expression:** The scope expression that was not satisfied
**err.missing:** The reduced subset of the expression containing only scopes that were missing

The first argument to `req.authorize` must be an object where the keys are parameters
to the scope expression defined in the method definition. If any parameters are missing
when you call this, the check will throw an error. The rules for how the scope expression
defined in the method is transformed given a set of parameters is described above.

To return a successful result with a JSON body, return `res.reply(result)`.
The result will be validated against the output schema, and if validation
fails, the error will be logged and the user will get a 500 error response.

Return errors with `res.reportError(code, messagePattern, details)`.  The
`code` argument must be one of those specified in the API declaration, or one
of the built-in codes (most of which you probably shouldn't use, as they are
only for very specific conditions that the API library detects):

 * `MalformedPayload`: HTTP 400, Only for JSON.parse() errors
 * `InvalidRequestArguments`: HTTP 400, Only for query and param validation errors
 * `InputValidationError`: HTTP 400, Only for JSON schema errors
 * `InputError`: HTTP 400, Other input errors (manually coded validation)
 * `AuthenticationFailed`: HTTP 401, Only if authentication failed
 * `InsufficientScopes`: HTTP 403, Only if request had insufficient scopes
 * `ResourceNotFound`: HTTP 404, If the resource wasn't found
 * `RequestConflict`: HTTP 409, If the request conflicts with server state
 * `ResourceExpired`: HTTP 410, If the resource expired over time
 * `InputTooLarge`: HTTP 413, Only if the payload is too big
 * `InternalServerError`: HTTP 500, Only for internal errors

In any case, the `messagePattern` and details are combined to produce an error
message.  Strings surrounded by `{{..}}` in `messagepattern` are used as keys
into `details`, with the result being JSON-encoded.  For example:

```js
res.reportError(
  'TooManyFoos',
  'You can only have 3 foos.  These foos already exist:\n{{foos}}',
  {foos: foomanager.foos(request.fooId)});
```

The resulting HTTP response will have a JSON body containing (whitespace adjusted)
```js
{
  "code": "TooManyFoos",
  "message": [
    'You can only have 3 foos.',
    'These foos already exist:',
    '[',
    '  1,',
    '  2,',
    '  3',
    ']',
    '----',
    'method:     toomanyfoos',
    'errorCode:  TooManyFoos',
    'statusCode: 472',
    'time:       2017-01-22T21:20:16.650Z',
  ].join('\n'),
  "requestInfo":{
    "method": "toomanyfoos",
    "params": {},
    "payload": {"foos":[4, 5]},
    "time": "2017-01-22T21:20:16.650Z",
  },
}
```

The request payload is provided in `requestInfo`, so there is no need to
reproduce its contents within the error message.

*Note:* use of `res.status(4..).json(..)` to return error statuses is an
anti-pattern.  While you may see older code that still follows this pattern, do
not repeat it!

## API Server Setup

The API instance will have a `setup` method that takes additional options and
returns a router which can be passed to an Express app's `app.use`.  The options
to `api.setup` are:

 * `inputLimit` - maximum input size, defaulting to`"10mb"`
 * `allowedCORSOrigin` - Allowed CORS origin, or null to disable CORS; defaults to `"*"`
 * `context` - Object to be provided as `this` in handlers.  This must have all properties
   specified in `context` when the API was declared.  The purpose of this parameter is to
   provide uesful application-specific objects such as Azure table objects or
   other API clients to the API methods.
 * `validator` (required) - a schema validator; this is a Validator object from
   [taskcluster-lib-validate](https://github.com/taskcluster/taskcluster-lib-validate).
 * `signatureValidator` - a validator for Hawk signatures; this is only required for
   the Auth service, as the default signature validator consults the Auth service.
 * `authBaseUrl` - base URL for the Auth service to use for authorizing requests; defaults
   to https://auth.taskcluster.net/v1
 * `nonceManager` - a function to check for replay attacks (seldom used)
 * `baseUrl` -  URL under which routes are mounted; generally something like `publicUrl + "/v1"`
 * `publish` - if true, publish the API metadata where documentation and client libraries
   can find it (should only be true for production deployments)
 * `referenceBucket` - Amazon S3 bucket to which references should be published (required if
   `publish` is true); defaults to `references.taskclutser.net`.
 * `referencePrefix` - Prefix within the reference bucket; something like
   `myservice/v1/api.json` (required if `publish` is true)
 * `aws` - AWS credentials for uploading to the reference bucket (required if `publish` is true);
   has the form `{accessKeyId: .., secretAccessKey: .., region: ..}`.
 * `monitor` - an instance of [taskcluster-lib-monitor](https://github.com/taskcluster/taskcluster-lib-monitor)

The result is an `express.Router` instance.

For most TaskCluster services, the startup process uses
[taskcluster-lib-loader](https://github.com/taskcluster/taskcluster-lib-loader),
and the relevant loader components are defined like this:

```js
let load = loader({
  // ...
  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: cfg.app.name,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validator({
      prefix: 'myservice/v1/',
      aws: cfg.aws,
    }),
  },

  api: {
    requires: ['cfg', 'monitor', 'validator'],
    setup: ({cfg, monitor, validator}) => api.setup({
      context:          {..},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          process.env.NODE_ENV === 'production',
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'myservice/v1/api.json',
      aws:              cfg.aws,
      monitor:          monitor.prefix('api'),
      validator,
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => {
      debug('Launching server.');
      let app = App(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
  },
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}
```

Consult the source of some of the existing TaskCluster services direcly for
more fully-worked examples.
