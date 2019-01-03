const assert = require('assert');
const taskcluster = require('taskcluster-client');
const debug = require('debug')('hooks:taskcreator');
const _ = require('lodash');
const jsone = require('json-e');
const libUrls = require('taskcluster-lib-urls');

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
    assert(options.rootUrl, 'Expected rootUrl');
    assert(options.credentials instanceof Object,
      'Expected credentials');

    this.rootUrl = options.rootUrl;
    this.credentials = options.credentials;
    this.LastFire = options.LastFire;
    this.monitor = options.monitor;
  }

  taskForHook(hook, context, options) {
    let task = jsone(hook.task, _.defaults({}, {taskId: options.taskId}, context));
    let created = options.created || new Date();
    // only apply created, deadline, and expires if they are not set
    if (!task.created) {
      task.created = created.toJSON();
    }
    if (!task.deadline) {
      task.deadline = taskcluster.fromNowJSON('1 day', created);
    }
    if (!task.expires) {
      task.expires = taskcluster.fromNowJSON('1 month', created);
    }

    // If the template did not set a taskGroupId, then set the taskGroupId to
    // the taskId, thereby creating a new task group and following the
    // convention for decision tasks.
    if (!task.taskGroupId) {
      task.taskGroupId = options.taskId;
    }
    return task;
  }

  async appendLastFire({hookGroupId, hookId, taskId, taskCreateTime, firedBy, result, error}) {
    await this.LastFire.create({
      hookGroupId,
      hookId,
      taskCreateTime,
      taskId,
      firedBy,
      result,
      error,
    });
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
      rootUrl: this.rootUrl,
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

    let lastFire, taskCreateRes, fireError;
    try {
      taskCreateRes = await queue.createTask(options.taskId, task);
      lastFire = {
        result: 'success',
        taskId: options.taskId,
        time: new Date(),
      };
    } catch (err) {
      let errModified;
      fireError = err;

      if (typeof err === 'object') {
        errModified = JSON.stringify(err);
      } else {
        errModified = err.toString();
      }
      if (errModified.length > 256 * 1024/2) {
        errModified = errModified.substring(0, 256 * 1024/2);
      }

      lastFire = {
        result: 'error',
        taskId: options.taskId,
        error: errModified,
        time: new Date(),
      };
    }

    try {
      await this.appendLastFire({
        hookGroupId: hook.hookGroupId,
        taskCreateTime: lastFire.time, 
        hookId: hook.hookId,
        firedBy: context.firedBy,
        taskId: lastFire.taskId,
        result: lastFire.result,
        error: lastFire.error || '',
      });
    } catch (err) {
      debug('Failed to append lastfire with err: %s', err);
      this.monitor.reportError(err);
    }

    // throw the original Error instance if there was an error
    if (fireError) {
      return Promise.reject(fireError);
    }
    return taskCreateRes;
  }
}

exports.TaskCreator = TaskCreator;

class MockTaskCreator extends TaskCreator {
  constructor() {
    super({credentials: {}, rootUrl: libUrls.testRootUrl()});
    this.shouldFail = false;
    this.fireCalls = [];
  }

  async fire(hook, context, options) {
    if (this.shouldFail) {
      let err = new Error();
      Object.assign(err, this.shouldFail);
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
