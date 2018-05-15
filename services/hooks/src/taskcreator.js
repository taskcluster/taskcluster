const assert = require('assert');
const taskcluster = require('taskcluster-client');
const debug = require('debug')('hooks:taskcreator');
const _ = require('lodash');
const jsone = require('json-e');

class TaskCreator {
  /** Create a TaskCreator instance.
   *
   * options:
   * {
   *   credentials:   // TaskCluster credentials
   * }
   * */
  constructor(options) {
    assert(options, 'options must be given');
    assert(options.credentials instanceof Object,
      'Expected credentials');
    this.credentials = options.credentials;
  }

  taskForHook(hook, context, options) {
    let task = jsone(hook.task, _.defaults({}, {taskId: options.taskId}, context));
    let created = options.created || new Date();
    // only apply created, deadline, and expires if they are not set
    if (!task.created) {
      task.created = created.toJSON();
    }
    if (!task.deadline) {
      task.deadline = taskcluster.fromNowJSON(hook.deadline, created);
    }
    if (!task.expires) {
      task.expires = taskcluster.fromNowJSON(hook.expires, created);
    }
    // set the taskGroupId to the taskId, thereby creating a new task group
    // and following the convention for decision tasks.
    task.taskGroupId = options.taskId;
    return task;
  }

  /**
  * Fire the given hook, using the given payload (interpolating it into the task
  * definition).  If options.taskId is set, it will be used as the taskId;
  * otherwise a new taskId will be created.  If options.created is set, then
  * it is used as the creation time for the task (to ensure idempotency).  If
  * options.retry is false, then the call will not be automatically retried on
  * 5xx errors.
  */
  async fire(hook, context, options) {
    options = _.defaults({}, options, {
      taskId: taskcluster.slugid(),
      created: new Date(),
      retry: true,
    });
    // create a queue instance with its authorized scopes limited to those
    // assigned to the hook.
    let role = 'assume:hook-id:' + hook.hookGroupId + '/' + hook.hookId;
    let queue = new taskcluster.Queue({
      credentials: this.credentials,
      authorizedScopes: [role],
      retries: options.retry ? 0 : 5,
    });

    debug('firing hook %s/%s to create taskId: %s',
      hook.hookGroupId, hook.hookId, options.taskId);
    const task = this.taskForHook(hook, context, options);

    if (this.fakeCreate) {
      // for testing, just record that we *would* hvae called this..
      this.lastCreateTask = {taskId: options.taskId, task};
      return {status: {taskId: options.taskId}};
    }
    return await queue.createTask(options.taskId, task);
  };
}

exports.TaskCreator = TaskCreator;

class MockTaskCreator extends TaskCreator {
  constructor() {
    super({credentials: {}});
    this.shouldFail = false;
    this.fireCalls = [];
  }

  async fire(hook, context, options) {
    if (this.shouldFail) {
      let err = new Error('uhoh');
      err.statusCode = 499;
      err.body = {message: 'uhoh'};
      throw err;
    }
    options = options || {};
    this.fireCalls.push({
      hookGroupId: hook.hookGroupId,
      hookId: hook.hookId,
      context,
      options});
    const taskId = options.taskId || taskcluster.slugid();
    return {
      status: {
        taskId: taskId,
        provisionerId: hook.task.provisionerId,
        workerType: hook.task.workerType,
        schedulerId: '-',
        taskGroupId: taskcluster.slugid(),
        deadline: '2015-10-18T22:32:59.706Z',
        expires: '2016-10-18T22:32:59.706Z',
        retriesLeft: 5,
        state: 'completed',
        runs: [],
      },
    };
  }
}

exports.MockTaskCreator = MockTaskCreator;
