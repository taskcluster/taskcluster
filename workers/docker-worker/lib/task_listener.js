/**
Primary interface which handles listening for messages and initializing the
execution of tasks.
*/

var QUEUE_PREFIX = 'worker/v1/';

var debug = require('debug')('docker-worker:task-listener');
var taskcluster = require('taskcluster-client');
var request = require('superagent-promise');
var os = require('os');

var Task = require('./task');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var TaskQueue = require('./queueservice');
var exceedsDiskspaceThreshold = require('./util/capacity').exceedsDiskspaceThreshold;
var DeviceManager = require('./devices/device_manager.js');

/**
@param {Configuration} config for worker.
*/
export default class TaskListener extends EventEmitter {
  constructor(runtime) {
    super();
    this.runtime = runtime;
    this.capacity = runtime.capacity;
    this.runningTasks = [];
    this.taskQueue = new TaskQueue(this.runtime);
    this.taskPollInterval = this.runtime.taskQueue.pollInterval;

    this.deviceManager = new DeviceManager(runtime);
  }

  listenForShutdowns() {
    // If node will be shutdown, stop consuming events.
    if (this.runtime.shutdownManager) {
      this.runtime.shutdownManager.once(
        'nodeTermination', () => {
          debug('nodeterm');
          async () => {
            await this.pause();
            for(let state of this.runningTasks) {
              try {
                state.handler.abort('worker-shutdown');
              }
              catch (e) {
                debug('Caught error, but node is being terminated so continue on.');
              }
              this.cleanupRunningState(state);
            }
          }();
        }.bind(this)
      );
    }
  }

  async cancelTask(message) {
    var runId = message.payload.runId;
    var reason = message.payload.status.runs[runId].reasonResolved;
    if (reason !== 'canceled') return;

    var taskId = message.payload.status.taskId;
    var state = this.runningTasks.find((state) => {
      let { handler } = state;
      return (handler.status.taskId === taskId && handler.runId === runId);
    });

    if (!state) {
      debug('task not found to cancel');
      return;
    }

    this.runtime.log('cancelling task', {taskId: message.payload.status.taskId});
    state.handler.cancel(reason);
    this.cleanupRunningState(state);
  }

  async listenForCancelEvents() {
    var queue = this.runtime.queue;

    var queueEvents = new taskcluster.QueueEvents();

    var cancelListener = new taskcluster.PulseListener({
      credentials: this.runtime.pulse
    });

    await cancelListener.bind(queueEvents.taskException({
      workerId: this.runtime.workerId,
      workerType: this.runtime.workerType,
      workerGroup: this.runtime.workerGroup,
      provisionerId: this.runtime.provisionerId
    }));

    cancelListener.on('message', this.cancelTask.bind(this));
    cancelListener.on('error', (error) => {
      // If an error occurs, log and remove the cancelListener.
      // In the future errors could be handled on the PulseListener level.
      this.runtime.log('[alert operator] listener error', { err: error });
      delete this.cancelListener;
    });

    await cancelListener.resume();
    return cancelListener;
  }

  async availableCapacity() {
    // Note: Sometimes capacity could be zero (dynamic capacity changes based on
    // shutdown and other factors) so subtracting runningTasks could result in a
    // negative number, hence the use of at least returning 0.
    let deviceCapacity;
    try {
      deviceCapacity = await this.deviceManager.getAvailableCapacity();
    }
    catch (e) {
      // If device capacity ccannot be determined for device managers configured
      // for the worker, then default to 0
      this.runtime.log('[alert-operator] error determining device capacity',
        {
          message: e.toString(),
          err: e,
          stack: e.stack
        }
      );

      deviceCapacity = 0;
    }

    let runningCapacity = Math.max(this.capacity - this.runningTasks.length, 0);
    let hostCapacity = Math.min(runningCapacity, deviceCapacity);

    if (hostCapacity < runningCapacity) {
      this.runtime.log('[info] host capacity adjusted',
        {
          message: `The available running capacity of the host has been changed.` +
                   ` Available Capacities: Device: ${deviceCapacity} ` +
                   `Running: ${runningCapacity} Adjusted Host Capacity: ${hostCapacity}`
        }
      );
    }

    return hostCapacity;
  }

  async getTasks() {
    let availableCapacity = await this.availableCapacity();
    if (availableCapacity === 0)  return;

    var exceedsThreshold = await exceedsDiskspaceThreshold(
      this.runtime.dockerVolume,
      this.runtime.capacityManagement.diskspaceThreshold,
      availableCapacity,
      this.runtime.log
    );
    // Do not claim tasks if not enough resources are available
    if (exceedsThreshold) return;

    let claims = await this.taskQueue.claimWork(availableCapacity);
    claims.forEach(this.runTask.bind(this));
  }

  scheduleTaskPoll(nextPoll=this.taskPollInterval) {
    this.pollTimeoutId = setTimeout(() => {
      async () => {
        clearTimeout(this.pollTimeoutId);

        try {
          await this.getTasks();
        }
        catch (e) {
          this.runtime.log('[alert-operator] task retrieval error', {
              message: e.toString(),
              err: e,
              stack: e.stack
          });
        }
        this.scheduleTaskPoll();
      }();
    }.bind(this), nextPoll);
  }

  async connect() {
    debug('begin consuming tasks');
    //refactor to just have shutdown manager call terminate()
    this.listenForShutdowns();
    this.taskQueue = new TaskQueue(this.runtime);

    this.cancelListener = await this.listenForCancelEvents();

    // Scheduled the next poll very soon use the error handling it provides.
    this.scheduleTaskPoll(1);
  }

  async close() {
    clearTimeout(this.pollTimeoutId);
    if(this.cancelListener) return await this.cancelListener.close();
  }

  /**
  Halt the flow of incoming tasks (but handle existing ones).
  */
  async pause() {
    clearTimeout(this.pollTimeoutId);
    if(this.cancelListener) return await this.cancelListener.pause();
  }

  /**
  Resume the flow of incoming tasks.
  */
  async resume() {
    this.scheduleTaskPoll();
    if(this.cancelListener) return await this.cancelListener.resume();
  }

  isIdle() {
    return this.runningTasks.length === 0;
  }

  /**
  Cleanup state of a running container (should apply to all states).
  */
  cleanupRunningState(state) {
    if (!state) return;

    if (state.devices) {
      for (let device in state.devices) {
        state.devices[device].release();
      }
    }
  }

  addRunningTask(runningState) {
    this.runningTasks.push(runningState);

    // After going from an idle to a working state issue a 'working' event.
    if (this.runningTasks.length === 1) {
      this.emit('working', this);
    }
  }

  removeRunningTask(runningState) {
    let taskIndex = this.runningTasks.findIndex((runningTask) => {
      return (runningTask.taskId === runningState.taskId) &&
        (runningTask.runId === runningState.runId)
    });

    if (taskIndex === -1) {
      this.runtime.log('[warning] running task removal error', {
        taskId: runningState.taskId,
        runId: runningState.runId,
        err: 'Could not find the task Id in the list of running tasks'
      });
      this.cleanupRunningState(runningState);
      return;
    }

    this.cleanupRunningState(runningState);
    this.runningTasks.splice(taskIndex, 1);

    if (this.isIdle()) this.emit('idle', this);
  }

  /**
  * Run task that has been claimed.
  */
  async runTask(claim) {
    let runningState;
    try {
      // Reference to state of this request...
      runningState = {
        devices: {},
        taskId: claim.status.taskId,
        runId: claim.runId
      };

      this.runtime.log(
        'run task',
        {
          taskId: runningState.taskId,
          runId: runningState.runId
        }
      );

      // Fetch full task definition.
      var task = await this.runtime.queue.task(runningState.taskId);

      // Date when the task was created.
      var created = new Date(task.created);

      // Only record this value for first run!
      if (!claim.status.runs.length) {
        // Record a stat which is the time between when the task was created and
        // the first time a worker saw it.
        this.runtime.stats.time('timeToFirstClaim', created);
      }

      let options = {};
      if (this.runtime.isolatedContainers) {
        runningState.devices['cpu'] = this.deviceManager.getDevice('cpu');
        options.cpuset = runningState.devices['cpu'].id;
      }

      let taskCapabilities = task.payload.capabilities || {};
      if (taskCapabilities.devices) {
        options.devices = {};
        debug('Aquiring task payload specific devices');

        for (let device in taskCapabilities.devices) {
          runningState.devices[device] = await this.deviceManager.getDevice(device);
          options.devices[device] = runningState.devices[device];
        }
      }

      // Create "task" to handle all the task specific details.
      var taskHandler = new Task(this.runtime, task, claim, options);
      runningState.handler = taskHandler;

      this.addRunningTask(runningState)

      // Run the task and collect runtime metrics.
      await taskHandler.start();

      this.removeRunningTask(runningState);
    }
    catch (e) {
      this.removeRunningTask(runningState);
      if (task) {
        this.runtime.log('task error', {
          taskId: claim.status.taskId,
          runId: task.runId,
          message: e.toString(),
          stack: e.stack,
          err: e
        });
      } else {
        this.runtime.log('task error', {
          message: e.toString(),
          err: e
        });
      }
    }

    this.runtime.stats.record('taskError');
  }
}
