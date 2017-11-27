var _       = require('lodash');
var assert  = require('assert');
var debug   = require('debug')('index:helpers');
var data    = require('./data');

/**
 * Insert task into `namespace` where:
 *
 * input:
 * {
 *   expires:      // Date object
 *   data:         // IndexedTask.data or JSON date string
 *   taskId:       // TaskId for task
 *   rank:         // IndexedTask.rank
 * }
 *
 * options:
 * {
 *   IndexedTask:    // data.IndexedTask
 *   Namespace:      // data.Namespace
 * }
 */
var insertTask = function(namespace, input, options) {
  // Validate input
  assert(input.expires instanceof Date,   'expires must be a Date object');
  assert(input.data instanceof Object,    'data must be an object');
  assert(input.taskId,                    'taskId must be given');
  assert(typeof input.rank === 'number', 'rank must be a number');
  assert(options.IndexedTask,
    'options.IndexedTask must be an instance of data.IndexedTask');
  assert(options.Namespace,
    'options.Namespace must be an instance of data.Namespace');

  // Get namespace and ensure that we have a least one dot
  var namespace = namespace.split('.');

  // Find name and namespace
  var name  = namespace.pop() || '';
  namespace = namespace.join('.');

  // Find expiration time and parse as date object
  var expires = new Date(input.expires);

  // Attempt to load indexed task
  return options.IndexedTask.load({
    namespace:    namespace,
    name:         name,
  }).then(function(task) {
    return task.modify(function() {
      // Update if we prefer input over what we have
      if (this.rank <= input.rank) {
        this.rank       = input.rank;
        this.data       = input.data;
        this.taskId     = input.taskId;
        this.expires    = expires;
        // Update expires on namespace hierarchy
        return options.Namespace.ensureNamespace(namespace, expires);
      }
    });
  }, function(err) {
    // Re-throw error, if it's not a 404
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }

    // Create namespace hierarchy
    return options.Namespace.ensureNamespace(
      namespace,
      expires
    ).then(function() {
      return options.IndexedTask.create({
        namespace:    namespace,
        name:         name,
        rank:         input.rank,
        taskId:       input.taskId,
        data:         input.data,
        expires:      expires,
      });
    });
  });
};

// Export insertTask
exports.insertTask = insertTask;

/** Regular expression for valid namespaces */
exports.namespaceFormat = /^([a-zA-Z0-9_!~*'()%-]+\.)*[a-zA-Z0-9_!~*'()%-]+$/;
