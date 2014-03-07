var Promise       = require('promise');
var request       = require('superagent');
var debug         = require('debug')('queue');

// Get queue base url from environment variable
var baseURL = process.env.QUEUE_URL;

// Check that base URL was given
if (!baseURL) {
  throw new Error("$QUEUE_URL must be defined!");
}

/** Get a URL for an API end-point on the queue */
var queueUrl = function(path) {
  return baseURL + '/v1' + path;
};
exports.queueUrl = queueUrl;

/** Default deadline offset relative to now */
var DEFAULT_DEADLINE_OFFSET = 24;

/** Set default retries to 1 */
var DEFAULT_RETRIES     = 1;

/** Set default priority to 5 */
var DEFAULT_PRIORITY    = 5;

/**
 * Post a task to the queue
 *
 * **`payload`** must specify `command`, `image` and `features`.
 *
 * **`options`** must specify `provisionerId`, `workerType` and `owner`, it may
 * also specify `description`, `source`, `retries`, `priority`, `name` and
 * `deadline` which can `Date` object or a number of hours into the future.
 *
 * This function returns a promise for the `taskId` assigned to the posted task.
 */
exports.postTask = function(payload, options) {
  if (!options.provisionerId ||
      !options.workerType) {
    throw new Error("Options must specify provisionerId and workerType");
  }

  // If deadline is a number, then we interpret it as number of hours into the
  // future
  if (typeof(options.deadline) === 'number' || options.deadline === undefined) {
    var offset = options.deadline || DEFAULT_DEADLINE_OFFSET;
    options.deadline = new Date();
    options.deadline.setHours(options.deadline.getHours() + offset);
  }
  // Convert deadline to JSON string if not already
  if (options.deadline instanceof Date) {
    options.deadline = options.deadline.toJSON();
  }

  // Create a default description
  if (options.description === undefined) {
    options.description = "Running " + payload.command + " on " + payload.image
  }

  // Create task to be posted
  var task = {
    version:                  '0.2.0',
    provisionerId:            options.provisionerId,
    workerType:               options.workerType,
    routing:                  options.routing     || "",
    timeout:                  options.timeout     || 180, // default timeout in seconds
    retries:                  options.retries     || DEFAULT_RETRIES,
    priority:                 options.priority    || DEFAULT_PRIORITY,
    created:                  (new Date()).toJSON(),
    deadline:                 options.deadline,
    payload:                  payload,
    metadata: {
      name:                   options.name        || payload.command.join(' '),
      description:            options.description,
      owner:                  options.owner,
      source:                 options.source      || "http://localhost"
    },
    tags:                     options.tags        || {}
  };

  // Post to server
  return new Promise(function(accept, reject) {
    request
      .post(queueUrl('/task/new'))
      .send(task)
      .end(function(res) {
        if (!res.ok) {
          debug("Failed to post task: %s", res.text);
          return reject(res.text);
        }
        debug("Task posted with taskId: " + res.body.status.taskId);
        accept(res.body.status.taskId);
      });
  });
};
