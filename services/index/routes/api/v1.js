var Promise     = require('promise');
var _           = require('lodash');
var debug       = require('debug')('routes:api:v1');
var assert      = require('assert');
var base        = require('taskcluster-base');
var helpers     = require('../../index/helpers');

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/index/v1/';

/**
 * API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   validator:         // base.validator instance
 *   IndexedTask:       // data.IndexedTask instance
 *   Namespace:         // data.Namespace instance
 * }
 */
var api = new base.API({
  title:        "Task Index API Documentation",
  description: [
    "The task index, typically available at `index.taskcluster.net`, is",
    "responsible for indexing tasks. In order to ensure that tasks can be",
    "located by recency and/or arbitrary strings. Common use-cases includes",
    "",
    " * Locate tasks by git or mercurial `<revision>`, or",
    " * Locate latest task from given `<branch>`, such as a release.",
    "",
    "**Index hierarchy**, tasks are indexed in a dot `.` separated hierarchy",
    "called a namespace. For example a task could be indexed in",
    "`<revision>.linux-64.release-build`. In this case the following",
    "namespaces is created.",
    "",
    " 1. `<revision>`, and,",
    " 2. `<revision>.linux-64`",
    "",
    "The inside the namespace `<revision>` you can find the namespace",
    "`<revision>.linux-64` inside which you can find the indexed task",
    "`<revision>.linux-64.release-build`. In this example you'll be able to",
    "find build for a given revision.",
    "",
    "**Task Rank**, when a task is indexed, it is assigned a `rank` (defaults",
    "to `0`). If another task is already indexed in the same namespace with",
    "the same lower or equal `rank`, the task will be overwritten. For example",
    "consider a task indexed as `mozilla-central.linux-64.release-build`, in",
    "this case on might choose to use a unix timestamp or mercurial revision",
    "number as `rank`. This way the latest completed linux 64 bit release",
    "build is always available at `mozilla-central.linux-64.release-build`.",
    "",
    "**Indexed Data**, when a task is located in the index you will get the",
    "`taskId` and an additional user-defined JSON blob that was indexed with",
    "task. You can use this to store additional information you would like to",
    "get additional from the index.",
    "",
    "**Entry Expiration**, all indexed entries must have an expiration date.",
    "Typically this defaults to one year, if not specified. If you are",
    "indexing tasks to make it easy to find artifacts, consider using the",
    "expiration date that the artifacts is assigned.",
    "",
    "**Indexing Routes**, tasks can be indexed using the API below, but the",
    "most common way to index tasks is adding a custom route on the following",
    "form `index.<namespace>`. In-order to add this route to a task you'll",
    "need the following scope `queue:route:index.<namespace>`. When a task has",
    "this route, it'll be indexed when the task is **completed successfully**.",
    "The task will be indexed with `rank`, `data` and `expires` as specified",
    "in `task.extra.index`, see example below:",
    "",
    "```js",
    "{",
    "  payload:  { /* ... */ },",
    "  routes: [",
    "    // index.<namespace> prefixed routes, tasks CC'ed such a route will",
    "    // be indexed under the given <namespace>",
    "    \"index.mozilla-central.linux-64.release-build\",",
    "    \"index.<revision>.linux-64.release-build\"",
    "  ],",
    "  extra: {",
    "    // Optional details for indexing service",
    "    index: {",
    "      // Ordering, this taskId will overwrite any thing that has",
    "      // rank <= 4000 (defaults to zero)",
    "      rank:       4000,",
    "",
    "      // Specify when the entries expires (Defaults to 1 year)",
    "      expires:          new Date().toJSON(),",
    "",
    "      // A little informal data to store along with taskId",
    "      // (less 16 kb when encoded as JSON)",
    "      data: {",
    "        hgRevision:   \"...\",",
    "        commitMessae: \"...\",",
    "        whatever...",
    "      }",
    "    },",
    "    // Extra properties for other services...",
    "  }",
    "  // Other task properties...",
    "}",
    "```",
    "",
    "**Remark**, when indexing tasks using custom routes, it's also possible",
    "to listen for messages about these tasks. Which is quite convenient, for",
    "example one could bind to `route.index.mozilla-central.*.release-build`,",
    "and pick up all messages about release builds. Hence, it is a",
    "good idea to document task index hierarchies, as these make up extension",
    "points in their own."
  ].join('\n')
});

// Export api
module.exports = api;


/** Get specific indexed task */
api.declare({
  method:         'get',
  route:          '/task/:namespace(*)',
  name:           'findTask',
  output:         SCHEMA_PREFIX_CONST + 'indexed-task-response.json#',
  title:          "Find Indexed Task",
  description: [
    "Find task by namespace, if no task existing for the given namespace, this",
    "API end-point respond `404`."
  ].join('\n')
}, function(req, res) {
  var ctx = this;
  var namespace = req.params.namespace || '';

  // Get namespace and ensure that we have a least one dot
  namespace = namespace.split('.');

  // Find name and namespace
  var name  = namespace.pop() || '';
  namespace = namespace.join('.');

  // Load indexed task
  return ctx.IndexedTask.load({
    namespace:    namespace,
    name:         name
  }).then(function(task) {
    return res.reply(task.json());
  }, function(err) {
    // Re-throw the error, if it's not a 404
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }
    // Return a 404 error
    return res.status(404).json({
      message:      'Indexed task not found',
      error: {
        namespace:  req.params.namespace
      }
    });
  });
});

/** List namespaces inside another namespace */
api.declare({
  method:         'get',
  route:          '/namespaces/:namespace(*)',
  name:           'listNamespaces',
  input:          SCHEMA_PREFIX_CONST + 'list-namespaces-request.json#',
  output:         SCHEMA_PREFIX_CONST + 'list-namespaces-response.json#',
  title:          "List Namespaces",
  description: [
    "List the namespaces immediately under a given namespace. This end-point",
    "list up to 1000 namespaces. If more namespaces are present a",
    "`continuationToken` will be returned, which can be given in the next",
    "request. For the initial request, the payload should be an empty JSON",
    "object.",
    "",
    "**Remark**, this end-point is designed for humans browsing for tasks, not",
    "services, as that makes little sense."
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var namespace = req.params.namespace || '';

  // Query with given namespace
  return ctx.Namespace.query({
    parent:      namespace
  }, {
    limit:          req.body.limit,
    continuation:   req.body.continuationToken
  }).then(function(data) {
    var retval = {};
    retval.namespaces = data.entries.map(function(ns) {
      return ns.json();
    });
    if (data.continuation) {
      retval.continuationToken = data.continuation;
    }
    return res.reply(retval);
  });
});


/** List tasks in namespace */
api.declare({
  method:         'get',
  route:          '/tasks/:namespace(*)',
  name:           'listTasks',
  input:          SCHEMA_PREFIX_CONST + 'list-tasks-request.json#',
  output:         SCHEMA_PREFIX_CONST + 'list-tasks-response.json#',
  title:          "List Tasks",
  description: [
    "List the tasks immediately under a given namespace. This end-point",
    "list up to 1000 tasks. If more tasks are present a",
    "`continuationToken` will be returned, which can be given in the next",
    "request. For the initial request, the payload should be an empty JSON",
    "object.",
    "",
    "**Remark**, this end-point is designed for humans browsing for tasks, not",
    "services, as that makes little sense."
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var namespace = req.params.namespace || '';

  return ctx.IndexedTask.query({
    namespace:    namespace
  }, {
    limit:        req.body.limit,
    continuation: req.body.continuationToken
  }).then(function(data) {
    var retval = {};
    retval.tasks = data.entries.map(function(task) {
      return task.json();
    });
    if (data.continuation) {
      retval.continuationToken = data.continuation;
    }
    return res.reply(retval);
  });
});

/** Insert new task into the index */
api.declare({
  method:         'put',
  route:          '/task/:namespace(*)',
  name:           'insertTask',
  deferAuth:      true,
  scopes:         ['index:insert-task:<namespace>'],
  input:          SCHEMA_PREFIX_CONST + 'insert-task-request.json#',
  output:         SCHEMA_PREFIX_CONST + 'indexed-task-response.json#',
  title:          "Insert Task into Index",
  description: [
    "Insert a task into the index. Please see the introduction above, for how",
    "to index successfully completed tasks automatically, using custom routes."
  ].join('\n')
}, function(req, res) {
  var ctx   = this;
  var input = req.body;
  var namespace = req.params.namespace || '';

  // Authenticate request by providing parameters
  if(!req.satisfies({
    namespace:       namespace
  })) {
    return;
  }

  // Parse date string
  input.expires = new Date(input.expires);

  // Insert task
  return helpers.insertTask(
    namespace,
    input,
    ctx
  ).then(function(task) {
    res.reply(task.json());
  });
});

/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  title:    "Ping Server",
  description: [
    "Documented later...",
    "",
    "**Warning** this api end-point is **not stable**."
  ].join('\n')
}, function(req, res) {
  res.status(200).json({
    alive:    true,
    uptime:   process.uptime()
  });
});