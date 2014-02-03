var nconf   = require('nconf');
var utils   = require('./utils');
var uuid    = require('uuid');

/** API end-point for version 0.2.0 */
var api = module.exports = new utils.API({
  limit:          '10mb'
});

/** Create tasks */
api.declare({
  method:   'post',
  route:    '/task/new',
  input:    'http://schemas.taskcluster.net/api/0.2.0/task-definition.json#',
  output:   'http://schemas.taskcluster.net/api/0.2.0/create-task-response.json#',
  title:    "Create new task",
  desc: [
    "Create a new task, the `status` of the resulting JSON is a task status",
    "structure, you can find the `task_id` in this structure, enjoy."
  ].join('\n')
}, function(req, res) {
  // Create task identifier
  var task_id = uuid.v4();

  res.reply({
    status: {
      "task_id":            task_id,
      "provisioner_id":     "jonasfj-test-aws-provisioner",
      "worker_type":        "map-this-to-my-cool-ami",
      "runs":               [],
      "state":              "pending",
      "reason":             "none",
      "routing":            "jonasfjs-precious-tasks.stupid-test.aws",
      "retries":            0,
      "priority":           2.6,
      "created":            "2014-02-01T03:22:36.356Z",
      "deadline":           "2014-03-01T03:22:36.356Z",
      "taken_until":        "1970-01-01T00:00:00.000Z"
    }
  });
});







/*

    POST  /task/<task-id>
    POST  /task/<task-id>/claim
    GET   /task/<task-id>/artifact-url
    POST  /task/<task-id>/completed
    GET   /claim-work/<provisioner-id>/<worker-type>
    GET   /pending-tasks/<provisioner-id>

*/
