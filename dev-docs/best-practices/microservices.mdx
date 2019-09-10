# Building Microservices

All Taskcluster services are implemented in subdirectories of the the `services/` directory in this respository.

The Taskcluster team shares responsibility for all services, although people may "specialize" in specific services and have additional expertise there.
This shared responsibility is easier for everyone if the implementations are similar, avoiding surprises when moving from one service to another.
This document aims to collect the practices and standards we've agreed on.

These conventions are strongly encouraged for new services and contributions updating existing services to follow them are always welcome.
When we have a good reason to not follow the convention for a specific service, we document why.

## Independence

Although they ar developed in the same repository, each service must operate as an independent entity, using only the public interfaces of other services.
Package imports between services are strictly forbidden.
Where this seems like a good idea, prefer to create a new [library](libraries) instead.

## Package Mechanics

A service has a `serviceName` and a `projectName`, the latter often having a `taskcluster-` prefix.
For example, `auth` and `taskcluster-auth`, respectively.

A service is implemented in `services/<serviceName>`.
That directory should have a `package.json` containing `name: "<projectName>"`.
Dependencies go in this `package.json`, while dev dependencies go in the root `package.json`.

Source code should be in `src/`.
No transpilation should be used: write JS that can be interpreted directly by the Node version in use in the repository.
(The web-server service is an exception, since it uses webpack to load `.graphql` files)

## Implementation

### taskcluster-lib-loader

The main entry-point for the service should be a file called `main.js`, which should use [taskcluster-lib-loader](../../libraries/loader) for loading components.

### taskcluster-lib-api

The API definition should be in a file called `api.js`:

```js
var api = new API({
  // ...
});

// Export api
module.exports = api;

/** Get hook groups **/
api.declare({
  // ...
});
// ...
```

This is then imported and set up in `main.js`:

```js
{
  router: {
    requires: ['cfg', 'profile', 'validator', 'monitor'],
    setup: ({cfg, profile, validator, monitor}) => {
      return v1.setup({
        context: {},
        authBaseUrl:      cfg.taskcluster.authBaseUrl,
        publish:          profile === 'production',
        baseUrl:          cfg.server.publicUrl + '/v1',
        referencePrefix:  'myservice/v1/api.json',
        aws:              cfg.aws,
        validator,
        monitor,
      });
    },
  },
}
```

Please note that if your endpoint needs a continuation token, the name of the query parameter should be `continuationToken`:

```js
api.declare({
  // ...
  query: {
    continuationToken: /./,
  },
  // ...
});
```

#### Error Handling

Do not use `res.status(..)` to return error messages.
Instead, use `res.reportError(code, message, details)`.
The `taskcluster-lib-api` library provides most of the codes you will need, specifically `InvalidInput`, `ResourceNotFound`, and `ResourceConflict`.

Prefer to use these built-in codes.
If you have a case where you must return a different HTTP code, or clients need to be able to distinguish the errors programmatically, add a new error code:

```js
var api = new API({
  description: [
    // ...
    '',
    '## Error Codes',
    '',
    '* `SomethingReallyBad` (472) - you\'re really not going to like this',
  ].join('\n'),
  errorCodes: {
    SomethingReallyBad: 472,
  },
});
// ...
res.reportError('SomethingReallyBad',
  'Something awful happened: {{awfulthing}}',
  {awfulThing: result.awfulness});
```

Be friendly and document the errors in the API's `description` property, as they are not automatically documented.

### taskcluster-lib-monitor

*Do not use* `taskcluster-lib-stats` or `raven`.
Instead, use `taskcluster-lib-monitor` as described in its documentation.

### taskcluster-web-server

#### GraphQL Schemas

For fields that may trigger an additional request for a client,
add a comment above the field definition of the form "Note: This field will trigger an additional request."
This will make sure developers are aware of possible performance penalties. For example:

```graphql
type Hook {
  hookGroupId: ID!
  hookId: ID!
  metadata: HookMetadata!
  schedule: [String]!
  task: JSON!
  expires: DateTime!
  deadline: DateTime!
  triggerSchema: JSON!
  # Note: This field will trigger an additional request.
  status(hookGroupId: ID = hookGroupId, hookId: ID = hookId): HookStatus
}
```
