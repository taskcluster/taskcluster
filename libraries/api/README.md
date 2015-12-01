TaskCluster API Utilities
=========================

Simple abstractions over `express` for declaring APIs with reference formats
that enables automatic documentation and client libraries.

**Quick example**
```js
let API = require('taskcluster-lib-api');

// First declare an API
let api = new API({
  // Title and description for docs
  title: 'My API',
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

// Now declare an API method (see code docs for additional options)
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

### Documentation from `API.declare`
You may also find this in the code, which the canonical documentation.

```js
/**
 * Declare an API end-point entry, where options is on the following form:
 *
 * {
 *   method:   'post|head|put|get|delete',
 *   route:    '/object/:id/action/:param',      // URL pattern with parameters
 *   params: {                                   // Patterns for URL params
 *     param: /.../,                             // Reg-exp pattern
 *     id(val) { return "..." }                  // Function, returns message
 *                                               // if value is invalid
 *     // The `params` option from new API(), will be used as fall-back
 *   },
 *   query: {                                    // Query-string parameters
 *     offset: /.../,                            // Reg-exp pattern
 *     limit(n) { return "..." }                 // Function, returns message
 *                                               // if value is invalid
 *     // Query-string options are always optional (at-least in this iteration)
 *   },
 *   name:     'identifierForLibraries',         // identifier for client libraries
 *   stability: base.API.stability.experimental, // API stability level
 *   scopes:   ['admin', 'superuser'],           // Scopes for the request
 *   scopes:   [['admin'], ['per1', 'per2']],    // Scopes in disjunctive form
 *                                               // admin OR (per1 AND per2)
 *   input:    'input-schema.json',              // optional, null if no input
 *   output:   'output-schema.json',             // optional, null if no output
 *   skipInputValidation:    true,               // defaults to false
 *   skipOutputValidation:   true,               // defaults to false
 *   title:     "My API Method",
 *   description: [
 *     "Description of method in markdown, enjoy"
 *   ].join('\n')
 * }
 *
 * The handler parameter is a normal connect/express request handler, it should
 * return JSON replies with `request.reply(json)` and errors with
 * `request.json(code, json)`, as `request.reply` may be validated against the
 * declared output schema.
 *
 * **Note** the handler may return a promise, if this promise fails we will
 * log the error and return an error message. If the promise is successful,
 * nothing happens.
 */
```