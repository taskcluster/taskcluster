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

## Implementation

### @taskcluster/lib-loader

The main entry-point for the service should be a file called `main.js`, which should use [@taskcluster/lib-loader](../../libraries/loader) for loading components.

### @taskcluster/lib-api

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
The `@taskcluster/lib-api` library provides most of the codes you will need, specifically `InvalidInput`, `ResourceNotFound`, and `ResourceConflict`.

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

### @taskcluster/lib-monitor

*Do not use* `taskcluster-lib-stats` or `raven`.
Instead, use `@taskcluster/lib-monitor` as described in its documentation.

### taskcluster-web-server

#### Playground

In development, taskcluster-web-server comes with an interactive GraphQL Playground and schema
explorer which can be used to experiment with queries, mutations, subscriptions, and explore schemas.
To start using it, fire up the server and navigate to `http://localhost:3050/playground`.
See [sample queries](../../services/web-server#sample-queries) for how to write queries, mutations,
and subscriptions.

Note: query variables and HTTP headers have their own separate containers in the playground. They are sometimes
hiding in the bottom of the window which makes them not trivial to see.

#### CRUD an endpoint

taskcluster-web-server acts as a GraphQL gateway to Taskcluster REST APIs. Most times you will find yourself simply
needing to either add/remove an endpoint. The process is usually two folds.
First you need to define the graphql schema fields then, second, you will want to create a resolver for each of the
fields defined in the graphql query.

As an example, let's consider exposing an endpoint `widget` from the taskcluster-notify service that takes a
widgetId as input and returns an object of the form `{ name: string, state: oneOf(['ok', 'onfire']) }`. Here's how the
request may come from the UI:

```graphql
query Sample {
  widget(widgetId: "XeC1Y4NjQp25SbK0o8ab7w") {
    name
    state
  }
}
```

For taskcluster-web-server to respond accordinly we will want to:

1. Define the GraphQL schema fields

GraphQL schemas are defined in `services/web-server/src/graphql/`.
We will need to define all of the fields which `widget` provides.
This is usually done by looking at the input and output schemas for that endpoint.
For taskcluster-notify schemas are defined in `services/web-server/src/graphql/Notify.graphql`.

Depending on the kind of request you have, we will be looking into adding the schema definition in one of
the `extend type Query|Mutation|Subscription` blocks. Refer to the docs on
[Query](https://www.apollographql.com/docs/apollo-server/schema/schema/#the-query-type),
[Mutations](https://www.apollographql.com/docs/apollo-server/schema/schema/#the-mutation-type), and
[Subscription](https://www.apollographql.com/docs/apollo-server/data/subscriptions/) for more information.

```diff
--- a/services/web-server/src/graphql/Notify.graphql
+++ b/services/web-server/src/graphql/Notify.graphql
@@ -11,6 +11,11 @@ enum NotificationType {
   MATRIX_ROOM
 }

+# The convention is to use capital letters for enums in GraphQL.
+enum WidgetStateType {
+  ONFIRE
+  OK
+}
+
 input NotificationAddressInput {
   notificationType: NotificationType!
   notificationAddress: String!
@@ -26,8 +31,14 @@ type NotificationAddressConnection implements Connection {
   edges: [NotificationAddressEdge]
 }

+type Widget {
+  name: String
+  state: WidgetStateType
+}
+
 extend type Query {
   listDenylistAddresses(filter: JSON, connection: PageConnection): NotificationAddressConnection
+  # "!" means graphql will enforce that a widgetId is provided, otherwise it won't go through to the resolver.
+  widgets(widgetId: ID!): Widget
 }

 extend type Mutation {
diff --git a/services/web-server/src/resolvers/Notify.js b/services/web-server/src/resolvers/Notify.js
index 77a966ca4..57a94bc96 100644
--- a/services/web-server/src/resolvers/Notify.js
+++ b/services/web-server/src/resolvers/Notify.js
@@ -6,6 +6,10 @@ module.exports = {
     IRC_CHANNEL: 'irc-channel',
     MATRIX_ROOM: 'matrix-room',
   },
+  # GraphQL convention for enums is to use capital letters but most of Taskcluster doesn't so we do the mapping here.
+  WidgetStateType: {
+    ONFIRE: 'onfire',
+    OK: 'ok',
+  },
   Query: {
     listDenylistAddresses(parent, { connection, filter }, { loaders }) {
       return loaders.listDenylistAddresses.load({ connection, filter });
```

2. Add a resolver

Now that we have the schema defined for the widget endpoint, the next step is to add
a resolver for each of the widget schema fields. All a resolver function does is fetch the data for its field.
The resolver should have the same name as the schema field so the server knows how to properly map a schema field to a resolver.
Once the resolvers have returned, the server will send the data back to the client. Resolvers are defined in
`services/web-server/src/resolvers/`.

```diff
diff --git a/services/web-server/src/resolvers/Notify.js b/services/web-server/src/resolvers/Notify.js
index 77a966ca4..87e05414e 100644
--- a/services/web-server/src/resolvers/Notify.js
+++ b/services/web-server/src/resolvers/Notify.js
@@ -6,10 +6,17 @@ module.exports = {
   Query: {
     listDenylistAddresses(parent, { connection, filter }, { loaders }) {
       return loaders.listDenylistAddresses.load({ connection, filter });
     },
+    widgets(parent, { widget }, { loaders }) {
+      return loaders.widget.load(widget);
+    },
   },
   Mutation: {
     async addDenylistAddress(parent, { address }, { clients }) {
diff --git a/services/web-server/src/loaders/notify.js b/services/web-server/src/loaders/notify.js
index 23655e845..8e0d4d69b 100644
--- a/services/web-server/src/loaders/notify.js
+++ b/services/web-server/src/loaders/notify.js
@@ -16,8 +16,20 @@ module.exports = ({ notify }, isAuthed, rootUrl, monitor, strategies, req, cfg,
       items: sift(filter, addresses),
     };
   });
+  const widget = new DataLoader(widgetIds =>
+    Promise.all(
+      widgetIds.map(async (widgetId) => {
+        try {
+          return notify.widget(widgetId);
+        } catch (err) {
+          return err;
+        }
+      }),
+    ),
+  );

   return {
     listDenylistAddresses,
+    widget,
   };
 };
```

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

## Scopes

Any scopes that the service needs in its credentials should be listed in `service/<name>/scopes.yml`.
