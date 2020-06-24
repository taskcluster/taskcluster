let assert = require('assert');
const data = require('./data');

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
 */
let insertTask = function(db, namespace, input) {
  // Validate input
  assert(input.expires instanceof Date, 'expires must be a Date object');
  assert(input.data instanceof Object, 'data must be an object');
  assert(input.taskId, 'taskId must be given');
  assert(typeof input.rank === 'number', 'rank must be a number');
  assert(db,
    'db must be set');

  // Get namespace and ensure that we have a least one dot
  namespace = namespace.split('.');

  // Find name and namespace
  let name = namespace.pop() || '';
  namespace = namespace.join('.');

  // Find expiration time and parse as date object
  let expires = new Date(input.expires);

  // Attempt to load indexed task
  return data.IndexedTask.get(db, {
    namespace: namespace,
    name: name,
  }).then(function(task) {
    return task.update(db, function() {
      // Update if we prefer input over what we have
      if (this.rank <= input.rank) {
        this.rank = input.rank;
        this.data = input.data;
        this.taskId = input.taskId;
        this.expires = expires;
        // Update expires on namespace hierarchy
        return data.Namespace.ensureNamespace(db, namespace, expires);
      }
    });
  }, function(err) {
    // Re-throw error, if it's not a 404
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }

    // Create namespace hierarchy
    return data.Namespace.ensureNamespace(
      db,
      namespace,
      expires,
    ).then(function() {
      const indexedTask = data.IndexedTask.fromApi({
        namespace: namespace,
        name: name,
        rank: input.rank,
        taskId: input.taskId,
        data: input.data,
        expires: expires,
      });
      return indexedTask.create(db);
    });
  });
};

// Export insertTask
exports.insertTask = insertTask;

/** Regular expression for valid namespaces */
exports.namespaceFormat = /^([a-zA-Z0-9_!~*'()%-]+\.)*[a-zA-Z0-9_!~*'()%-]+$/;

exports.MAX_MODIFY_ATTEMPTS = 5;
