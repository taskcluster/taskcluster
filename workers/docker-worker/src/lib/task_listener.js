/**
Primary interface which handles listening for messages and initializing the
execution of tasks.
*/
const TaskQueue = require('./queueservice');
const DeviceManager = require('./devices/device_manager');
const Debug = require('debug');
const got = require('got');
const { Task } = require('./task');
const { EventEmitter } = require('events');
const { exceedsDiskspaceThreshold } = require('./util/capacity');
const os = require('os');

const debug = Debug('docker-worker:task-listener');

/**
@param {Configuration} config for worker.
*/
class TaskListener extends EventEmitter {
  constructor(runtime) {
    super();
    this.runtime = runtime;
    this.runningTasks = [];
    this.taskQueue = new TaskQueue(this.runtime);
    this.taskPollInterval = this.runtime.taskQueue.pollInterval;
    this.lastTaskEvent = Date.now();
    this.host = runtime.hostManager;
    this.supersedingTimeout = 5000;
    this.lastKnownCapacity = 0;
    this.totalRunTime = 0;
    this.lastCapacityState = {
      time: new Date(),
      idle: this.lastKnownCapacity,
      busy: this.runningTasks.length
    };
    this.reportCapacityStateIntervalId = setInterval(
      this.reportCapacityState.bind(this), 60 * 1000
    );
    this.capacityMonitor = this.runtime.workerTypeMonitor.childMonitor('capacity');
    this.deviceManager = new DeviceManager(runtime);
  }

  listenForShutdowns() {
    // If node will be shutdown, stop consuming events.
    if (this.runtime.shutdownManager) {
      this.runtime.shutdownManager.once('nodeTermination', async () => {
        debug('nodeterm');
        this.runtime.monitor.count('spotTermination');
        await this.pause();
        for (let state of this.runningTasks) {
          try {
            state.handler.abort('worker-shutdown');
          } catch (e) {
            debug('Caught error, but node is being terminated so continue on.');
          }
          this.cleanupRunningState(state);
        }
      });
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

    let runningCapacity = Math.max(this.runtime.capacity - this.runningTasks.length, 0);
    let hostCapacity = Math.min(runningCapacity, deviceCapacity);
    this.lastKnownCapacity = hostCapacity;

    if (hostCapacity < runningCapacity) {
      this.runtime.log('[info] host capacity adjusted',
        {
          message: 'The available running capacity of the host has been changed.' +
                   ` Available Capacities: Device: ${deviceCapacity} ` +
                   `Running: ${runningCapacity} Adjusted Host Capacity: ${hostCapacity}`
        }
      );
    }

    return hostCapacity;
  }

  async getTasks() {
    let availableCapacity = await this.availableCapacity();
    if (availableCapacity === 0) {
      return;
    }

    await this.runtime.volumeCache.purgeCaches();

    // Run a garbage collection cycle to clean up containers and release volumes.
    // Only run a full garbage collection cycle if no tasks are running.
    await this.runtime.gc.sweep(this.runningTasks.length === 0);

    var exceedsThreshold = await exceedsDiskspaceThreshold(
      this.runtime.dockerVolume,
      this.runtime.capacityManagement.diskspaceThreshold,
      availableCapacity,
      this.runtime.log,
      this.runtime.monitor
    );
    // Do not claim tasks if not enough resources are available
    if (exceedsThreshold) return;

    let claims = await this.taskQueue.claimWork(availableCapacity);
    let tasksets = await Promise.all(claims.map(this.applySuperseding.bind(this)));
    // call runTaskset for each taskset, but do not wait for it to complete
    Promise.all(tasksets.map(this.runTaskset.bind(this))).then(() => {
      if (this.runtime.shutdownManager.shouldExit()) {
        this.runtime.logEvent({eventType: 'instanceShutdown'});
        process.exit();
      }
    });
  }

  scheduleTaskPoll(nextPoll=this.taskPollInterval) {
    this.pollTimeoutId = setTimeout(async () => {
      try {
        await this.getTasks();
      } catch (e) {
        this.runtime.log('[alert-operator] task retrieval error', {
          message: e.toString(),
          err: e,
          stack: e.stack
        });
      }
      this.scheduleTaskPoll();
    }, nextPoll);
  }

  async connect() {
    debug('begin consuming tasks');
    //refactor to just have shutdown manager call terminate()
    this.listenForShutdowns();
    this.taskQueue = new TaskQueue(this.runtime);

    this.runtime.logEvent({
      eventType: 'instanceBoot',
      timestamp: Date.now() - os.uptime(),
    });

    this.runtime.logEvent({eventType: 'workerReady'});

    // Scheduled the next poll very soon use the error handling it provides.
    this.scheduleTaskPoll(1);
  }

  async close() {
    clearInterval(this.reportCapacityStateIntervalId);
    clearTimeout(this.pollTimeoutId);
  }

  /**
  Halt the flow of incoming tasks (but handle existing ones).
  */
  async pause() {
    clearTimeout(this.pollTimeoutId);
  }

  /**
  Resume the flow of incoming tasks.
  */
  async resume() {
    this.scheduleTaskPoll();
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

  recordCapacity () {
    this.runtime.monitor.measure(
      'capacity.duration.lastTaskEvent',
      Date.now() - this.lastTaskEvent
    );

    this.runtime.monitor.count('capacity.idle', this.lastKnownCapacity);
    this.runtime.monitor.count('capacity.runningTasks', this.runningTasks.length);
    this.runtime.monitor.count(
      'capacity.total',
      this.lastKnownCapacity + this.runningTasks.length
    );
    this.lastTaskEvent = Date.now();
  }

  addRunningTask(runningState) {
    //must be called before the task is added
    this.recordCapacity();

    this.runningTasks.push(runningState);

    // After going from an idle to a working state issue a 'working' event.
    // unless we receive a notification of worker shutdown
    if (this.runningTasks.length === 1 && !this.runtime.shutdownManager.shouldExit()) {
      this.emit('working', this);
    }
  }

  removeRunningTask(runningState) {
    let taskIndex = this.runningTasks.findIndex((runningTask) => {
      return (runningTask.taskId === runningState.taskId) &&
        (runningTask.runId === runningState.runId);
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
    //must be called before the task is spliced away
    this.recordCapacity();

    this.cleanupRunningState(runningState);
    this.totalRunTime += Date.now() - runningState.startTime;
    this.runningTasks.splice(taskIndex, 1);
    this.lastKnownCapacity += 1;

    if (this.isIdle()) this.emit('idle', this);
  }

  reportCapacityState() {
    let state = {
      time: new Date(),
      idle: this.lastKnownCapacity,
      busy: this.runningTasks.length,
    };
    let time = (
      state.time.getTime() - this.lastCapacityState.time.getTime()
    ) / 1000;
    this.capacityMonitor.count('capacity-busy', this.lastCapacityState.busy * time);
    this.capacityMonitor.count('capacity-idle', this.lastCapacityState.idle * time);
    if (this.lastCapacityState.busy === 0) {
      this.capacityMonitor.count('running-eq-0', time);
    }
    if (this.lastCapacityState.busy >= 1) {
      this.capacityMonitor.count('running-ge-1', time);
    }
    if (this.lastCapacityState.busy >= 2) {
      this.capacityMonitor.count('running-ge-2', time);
    }
    if (this.lastCapacityState.busy >= 3) {
      this.capacityMonitor.count('running-ge-3', time);
    }
    if (this.lastCapacityState.busy >= 4) {
      this.capacityMonitor.count('running-ge-4', time);
    }
    if (this.lastCapacityState.busy >= 6) {
      this.capacityMonitor.count('running-ge-6', time);
    }
    if (this.lastCapacityState.busy >= 8) {
      this.capacityMonitor.count('running-ge-8', time);
    }

    if (this.lastCapacityState.idle === 0) {
      this.capacityMonitor.count('idle-eq-0', time);
    }
    if (this.lastCapacityState.idle >= 1) {
      this.capacityMonitor.count('idle-ge-1', time);
    }
    if (this.lastCapacityState.idle >= 2) {
      this.capacityMonitor.count('idle-ge-2', time);
    }
    if (this.lastCapacityState.idle >= 3) {
      this.capacityMonitor.count('idle-ge-3', time);
    }
    if (this.lastCapacityState.idle >= 4) {
      this.capacityMonitor.count('idle-ge-4', time);
    }
    if (this.lastCapacityState.idle >= 6) {
      this.capacityMonitor.count('idle-ge-6', time);
    }
    if (this.lastCapacityState.idle >= 8) {
      this.capacityMonitor.count('idle-ge-8', time);
    }
    this.lastCapacityState = state;

    let totalRunTime = this.totalRunTime;
    this.runningTasks.forEach(task => {
      totalRunTime += Date.now() - task.startTime;
    });

    let uptime = this.host.billingCycleUptime();
    let efficiency = (totalRunTime / (this.runtime.capacity * (uptime * 1000))) * 100;
    this.runtime.log(
      'reporting efficiency',
      {efficiency, uptime, totalRunTime, capacity: this.capcity});
    this.runtime.workerTypeMonitor.measure('total-efficiency', efficiency);
  }

  /**
   * Look for tasks we can supersede, claiming any additional tasks directly
   * from the TC queue service, then calling runTask with the resulting task
   * set.
   */
  async applySuperseding(claim) {
    let task = claim.task;
    let taskId = claim.status.taskId;

    try {
      // if the task is not set up to supersede anything, then the taskset is just the one claim
      if (!task.payload.supersederUrl) {
        this.runtime.log('not superseding', {taskId, message: 'no supersederUrl in payload'});
        return [claim];
      }

      let supersederUrl = task.payload.supersederUrl;
      if (!/^https?:\/\/[\x20-\x7e]*$/.test(supersederUrl)) {
        this.runtime.log('not superseding', {taskId, message: 'invalid supersederUrl in payload'});
        // validatPayload will fail for this task, giving hte user a helpful error message.
        // The important thing is that we don't fetch this supersederUrl.
        return [claim];
      }

      let tasks = (await this.fetchSupersedingTasks(supersederUrl, taskId));
      if (!tasks || tasks.length == 0) {
        this.runtime.log('not superseding', {taskId, supersederUrl,
          message: 'no tasks supersede this one'});
        return [claim];
      }

      // if the returned list does not contain the initial taskId, then ignore
      // the request; this is an invalid response from the superseder
      if (!tasks.includes(taskId)) {
        this.runtime.log('not superseding', {taskId, supersederUrl,
          message: 'initial taskId not included in result from superseder'});
        return [claim];
      }

      // claim runId 0 for each of those tasks; we can consider adding support
      // for other runIds later.
      var claims = await Promise.all(tasks.map(async tid => {
        if (tid == taskId) {
          return claim; // already claimed
        }

        try {
          return await this.runtime.queue.claimTask(tid, 0, {
            workerId: this.runtime.workerId,
            workerGroup: this.runtime.workerGroup,
          });
        } catch(e) {
          this.runtime.log('while superseding - secondary claim failure', {
            taskId: tid,
            runId: 0,
            message: e.toString(),
            stack: e.stack,
            err: e
          });
          return;
        }
      }));

      // filter out missed claims
      claims = claims.filter(cl => cl);

      return claims;
    } catch (e) {
      this.runtime.log('superseding error', {
        taskId: claim.status.taskId,
        runId: claim.runId,
        message: e.toString(),
        stack: e.stack,
        err: e
      });

      // fail quietly by just returning the primary claim
      return [claim];
    }
  }

  async fetchSupersedingTasks(url, taskId) {
    url = url + '?taskId=' + taskId;
    try {
      return await got(url, {
        timeout: this.supersedingTimeout
      }).then(res => JSON.parse(res.body)['supersedes']);
    } catch(e) {
      throw new Error(`Failure fetching from superseding URL ${url}: ${e}`);
    }
  }

  /**
  * Run task that has been claimed.
  */
  async runTaskset(claims) {
    let runningState;
    // the claim we're actually going to execute (the primary claim) is the
    // first one; the rest will be periodically reclaimed and then resolved,
    // but will not actually execute.
    let claim = claims[0];

    try {

      // Reference to state of this request...
      runningState = {
        startTime: Date.now(),
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

      // Look up full task definition in claim response.
      var task = claim.task;

      // Date when the task was created.
      var created = new Date(task.created);

      // Only record this value for first run!
      if (!claim.status.runs.length) {
        // Record a stat which is the time between when the task was created and
        // the first time a worker saw it.
        this.runtime.monitor.measure('timeToFirstClaim', Date.now() - created);
      }

      let options = {};
      if (this.runtime.restrictCPU) {
        runningState.devices['cpu'] = this.deviceManager.getDevice('cpu');
        options.cpusetCpus = runningState.devices['cpu'].id;
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
      var taskHandler = new Task(this.runtime, task, claims, options);
      runningState.handler = taskHandler;

      this.addRunningTask(runningState);

      if (this.runtime.shutdownManager.shouldExit()) {
        runningState.handler.abort('worker-shutdown');
      }

      // Run the task and collect runtime metrics.
      try {
        this.runtime.logEvent({
          eventType: 'taskQueue',
          task: taskHandler,
          timestamp: new Date(task.created).getTime(),
        });

        this.runtime.logEvent({
          eventType: 'taskStart',
          task: taskHandler,
        });

        await taskHandler.start();
      } finally {
        this.runtime.logEvent({
          eventType: 'taskFinish',
          task: taskHandler,
        });
      }

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

    this.runtime.monitor.count('task.error');
  }
}

module.exports = TaskListener;
