const Debug = require('debug');
const taskcluster = require('taskcluster-client');
const assert = require('assert');

const MAX_MESSAGES_PER_REQUEST = 32;

let debug = Debug('taskcluster-docker-worker:queueService');

/**
 * Create a task queue that will poll for queues that could contain messages and
 * claim work based on the available capacity of the worker.
 *
 * config: (a copy of Runtime)
 * {
 *   workerId:          // Worker ID for this worker
 *   workerType:        // Worker type for this worker
 *   workerGroup:       // Worker group for this worker
 *   provisionerID:     // ID of the provisioner used for this worker
 *   log:               // Logger instance
 *   taskcluster:       // Taskcluster credentials
 *   rootUrl:           // Root URL
 * }
 *
 */
class TaskQueue {
  constructor(config) {
    assert(config.workerId, 'Worker ID is required');
    assert(config.workerType, 'Worker type is required');
    assert(config.workerGroup, 'Worker group is required');
    assert(config.provisionerId, 'Provisioner ID is required');
    assert(config.taskcluster, 'Taskcluster credentials are required');
    assert(config.rootUrl, 'Taskcluster rotoUrl is required');
    assert(config.log, 'Logger is required');

    this.runtime = config;

    this.workerType = config.workerType;
    this.provisionerId = config.provisionerId;
    this.workerGroup = config.workerGroup;
    this.workerId = config.workerId;
    this.log = config.log;
  }

  /**
   * Queue will make an attempt to claim as much work as capacity allows.
   *
   * @param {Number} capacity - Number of tasks the worker is able to work on
   *
   * @param {Array} claims
   */
  async claimWork(capacity) {
    capacity = Math.min(capacity, MAX_MESSAGES_PER_REQUEST);
    debug(`polling for ${capacity} tasks`);

    const queue = this.queueClient();
    let result = await queue.claimWork(this.provisionerId, this.workerType, {
      tasks: capacity,
      workerGroup: this.workerGroup,
      workerId: this.workerId,
    });

    debug(`claimed ${result.tasks.length} tasks`);

    result.tasks.forEach(claim => {
      this.log('claimed task', {
        taskId: claim.status.taskId,
        runId: claim.runId,
      });
    });
    return result.tasks;
  }

  /**
   * Call the queue service's claimTask endpoint
   */
  async claimTask(taskId, runId) {
    const queue = this.queueClient();
    return await queue.claimTask(taskId, runId, {
      workerId: this.runtime.workerId,
      workerGroup: this.runtime.workerGroup,
    });
  }

  /**
   * Create a new Queue client object.  This is done on-demand so that it uses
   * the most up-to-date credentials.
   */
  queueClient() {
    return new taskcluster.Queue({
      rootUrl: this.runtime.rootUrl,
      credentials: this.runtime.taskcluster,
    });
  }
}

module.exports = TaskQueue;
