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
   *   credentials:   // Taskcluster credentials
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
    const now = options.created;
    let task = jsone(hook.task, _.defaults({}, {now, taskId: options.taskId}, context));
    if (!task) {
      return;
    }

    // only apply created, deadline, and expires if they are not set
    if (!task.created) {
      task.created = now.toJSON();
    }
    if (!task.deadline) {
      task.deadline = taskcluster.fromNowJSON('1 day', now);
    }
    if (!task.expires) {
      task.expires = taskcluster.fromNowJSON('1 month', now);
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
  *
  * Returns a value matching `trigger-hook-response.yml`, or throws an
  * exception if the task cannot be created.  Such an exception is also
  * reported to the user via the LastFire table, so it is safe to ignore it.
  */
  async fire(hook, context, options) {
    options = _.defaults({}, options, {
      taskId: taskcluster.slugid(),
      created: new Date(),
      retry: true,
    });
    this.monitor.count(`fire.${context.firedBy}.all`);

    // Inner implementation, returning
    // `lastFire` (entry to insert into lastFire row, if any)
    // and exactly one of `error` (error to be thrown) or `response`
    // (a response value from triggerHook).
    const inner = async () => {
      const lastFire = {
        hookGroupId: hook.hookGroupId,
        hookId: hook.hookId,
        taskCreateTime: new Date(),
        firedBy: context.firedBy,
        taskId: options.taskId,
        result: 'error',
        error: '',
      };

      // create a queue instance with its authorized scopes limited to those
      // assigned to the hook.
      const role = 'assume:hook-id:' + hook.hookGroupId + '/' + hook.hookId;
      const queue = new taskcluster.Queue({
        rootUrl: this.rootUrl,
        credentials: this.credentials,
        authorizedScopes: [role],
        retries: options.retry ? 0 : 5,
      });

      let task;
      try {
        task = this.taskForHook(hook, context, options);
      } catch (err) {
        lastFire.error = err.toString();
        return {lastFire, error: err};
      }

      if (!task) {
        this.monitor.count(`fire.${context.firedBy}.declined`);
        return {response: {}, declined: true};
      }
      this.monitor.count(`fire.${context.firedBy}.created`);

      debug('firing hook %s/%s to create taskId: %s',
        hook.hookGroupId, hook.hookId, options.taskId);
      if (this.fakeCreate) {
        // for testing, just record that we *would* hvae called this..
        this.lastCreateTask = {taskId: options.taskId, task};
        return {response: {status: {taskId: options.taskId}}};
      }

      try {
        const response = await queue.createTask(options.taskId, task);
        lastFire.result = 'success';
        return {lastFire, response};
      } catch (err) {
        // reformat the error to fit within the (string-formatted) 'error' field
        // of the LastFire table
        let lfError;

        if (typeof err === 'object') {
          lfError = JSON.stringify(err, null, 2);
        } else {
          lfError = err.toString();
        }
        if (lfError.length > 256 * 1024 / 2) {
          lfError = lfError.substring(0, 256 * 1024 / 2);
        }

        lastFire.error = lfError;
        return {lastFire, error: err};
      }
    };

    const {lastFire, error, response, declined} = await inner();

    this.monitor.log.hookFire({
      hookGroupId: hook.hookGroupId,
      hookId: hook.hookId,
      firedBy: context.firedBy,
      taskId: options.taskId,
      result: error ? 'failure' : (declined ? 'declined' : 'success'),
    });

    if (lastFire) {
      await this.appendLastFire(lastFire);
    }

    if (error) {
      throw error;
    } else {
      return response;
    }
  }
}

exports.TaskCreator = TaskCreator;

class MockTaskCreator extends TaskCreator {
  constructor() {
    super({credentials: {}, rootUrl: libUrls.testRootUrl()});
    this.shouldFail = false;
    this.shouldNotProduceTask = false;
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
    if (this.shouldNotProduceTask) {
      return;
    }
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
