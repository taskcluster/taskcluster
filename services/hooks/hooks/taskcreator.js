var assert      = require('assert');
var slugid      = require('slugid');
var taskcluster = require('taskcluster-client');
var debug       = require('debug')('hooks:taskcreator');
var _           = require('lodash');

class TaskCreator {
  /** Create a TaskCreator instance.
   *
   * options:
   * {
   *   credentials:   // TaskCluster credentials
   * }
   * */
  constructor(options) {
    assert(options, "options must be given");
    assert(options.credentials instanceof Object,
        "Expected credentials");
    this.credentials = options.credentials;
  }

  taskForHook(hook) {
    let task = _.cloneDeep(hook.task);
    task.created = new Date().toJSON();
    task.deadline = taskcluster.fromNow(hook.deadline).toJSON();
    if (hook.expires) {
      task.expires = taskcluster.fromNow(hook.expires).toJSON();
    }
    return Promise.resolve(task);
  }

  /**
  * Fire the given hook, using the given payload (interpolating it into the task
  * definition).  If options.taskId is set, it will be used as the taskId;
  * otherwise a new taskId will be created.
  */
  async fire(hook, payload, options) {
    options = options || {};
    var taskId = options.taskId;
    if (!taskId) {
      taskId = slugid.v4();
    }

    // create a queue instance with its authorized scopes limited to those
    // assigned to the hook.
    let role = 'assume:hook-id:' + hook.hookGroupId + '/' + hook.hookId;
    let queue = new taskcluster.Queue({
      credentials: this.credentials,
      authorizedScopes: [role]
    });

    // TODO: payload is ignored right now

    debug('firing hook %s/%s to create taskId: %s',
        hook.hookGroupId, hook.hookId, taskId);
    let resp = await queue.createTask(taskId, this.taskForHook(hook));
    return resp;
  };
}

module.exports.TaskCreator = TaskCreator;

class MockTaskCreator extends TaskCreator {
  constructor() {
    super({credentials: {}});
    this.fireCalls = [];
  }

  async fire(hook, payload, options) {
    this.fireCalls.push({hook, payload, options});
    var taskId = options? options.taskId : slugid.v4();
    return {
      "status": {
        "taskId": taskId,
        "provisionerId": hook.task.provisionerId,
        "workerType": hook.task.workerType,
        "schedulerId": "-",
        "taskGroupId": slugid.v4(),
        "deadline": "2015-10-18T22:32:59.706Z",
        "expires": "2016-10-18T22:32:59.706Z",
        "retriesLeft": 5,
        "state": "completed",
        "runs": []
      }
    };
  }
}

module.exports.MockTaskCreator = MockTaskCreator;
