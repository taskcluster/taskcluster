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
    "Task indexing server"
  ].join('\n')
});

// Export api
module.exports = api;


/** Get specific indexed task */
api.declare({
  method:         'get',
  route:          '/index/:namespace',
  name:           'find',
  output:         SCHEMA_PREFIX_CONST + 'indexed-task-response.json#',
  title:          "Find Indexed Task",
  description: [
    "find"
  ].join('\n')
}, function(req, res) {
  var ctx = this;

  // Get namespace and ensure that we have a least one dot
  var namespace = req.params.namespace.split('.');

  // Find name and namespace
  var name  = namespace.pop() || '';
  namespace = namespace.join('.');

  // Load indexed task
  return ctx.IndexedTask.load(namespace, name).then(function(task) {
    return res.reply(task.json());
  }, function(err) {
    // Re-throw the error, if it's not a 404
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }
    // Return a 404 error
    return req.status(404).json({
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
  route:          '/index/:namespace/list-namespaces',
  name:           'listNamespaces',
  input:          SCHEMA_PREFIX_CONST + 'list-namespaces-request.json#',
  output:         SCHEMA_PREFIX_CONST + 'list-namespaces-response.json#',
  title:          "List Namespaces",
  description: [
    "list namespaces"
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var namespace = req.params.namespace;

  return ctx.Namespace.iteratePartitionKey(
    namespace,
    req.body.continuationToken
  ).then(function(result) {
    var namespaces        = result[0];
    var continuationToken = result[1];
    return res.reply({
      namespaces: namespaces.map(function(ns) {
        return ns.json();
      }),
      continuationToken:  continuationToken
    });
  });
});

/** List tasks in namespace */
api.declare({
  method:         'get',
  route:          '/index/:namespace/list-tasks',
  name:           'listTasks',
  input:          SCHEMA_PREFIX_CONST + 'list-tasks-request.json#',
  output:         SCHEMA_PREFIX_CONST + 'list-tasks-response.json#',
  title:          "List Tasks",
  description: [
    "list tasks"
  ].join('\n')
}, function(req, res) {
  var ctx       = this;
  var namespace = req.params.namespace;

  return ctx.IndexedTask.iteratePartitionKey(
    namespace,
    req.body.continuationToken
  ).then(function(result) {
    var tasks             = result[0];
    var continuationToken = result[1];
    return res.reply({
      tasks: tasks.map(function(task) {
        return task.json();
      }),
      continuationToken:  continuationToken
    });
  });
});

/** Insert new task into the index */
api.declare({
  method:         'put',
  route:          '/index/:namespace',
  name:           'insert',
  deferAuth:      true,
  scopes:         ['index:insert:<namespace>'],
  input:          SCHEMA_PREFIX_CONST + 'insert-task-request.json#',
  output:         SCHEMA_PREFIX_CONST + 'indexed-task-response.json#',
  title:          "Insert Task into Index",
  description: [
    "index a task"
  ].join('\n')
}, function(req, res) {
  var ctx   = this;
  var input = req.body;

  // Authenticate request by providing parameters
  if(!req.satisfies({
    namespace:       req.params.namespace
  })) {
    return;
  }

  // Parse date string
  input.expires = new Date(input.expires);

  // Insert task
  return helpers.insertTask(
    req.params.namespace,
    input,
    ctx
  ).then(function(task) {
    res.reply(task.json());
  });
});
