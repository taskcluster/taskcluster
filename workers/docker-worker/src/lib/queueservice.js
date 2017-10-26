const Debug = require('debug');
const assert = require('assert');

const MAX_MESSAGES_PER_REQUEST = 32;

let debug = Debug('taskcluster-docker-worker:queueService');

/**
 * Create a task queue that will poll for queues that could contain messages and
 * claim work based on the available capacity of the worker.
 *
 * config:
 * {
 *   workerId:          // Worker ID for this worker
 *   workerType:        // Worker type for this worker
 *   workerGroup:       // Worker group for this worker
 *   provisionerID:     // ID of the provisioner used for this worker
 *   queue:             // Queue instance as provided by taskcluster-client
 *   log:               // Logger instance
 *   task: {
 *     dequeueCount:    // Times a task should be dequeued before permanently
 *                      // removing from the queue.
 *   }
 *   taskQueue: {
 *     expiration:            // Time in milliseconds used to determine if the
 *                            // queues should be refreshed
 *   }
 * }
 *
 */
class TaskQueue {
  constructor(config) {
    assert(config.workerId, 'Worker ID is required');
    assert(config.workerType, 'Worker type is required');
    assert(config.workerGroup, 'Worker group is required');
    assert(config.provisionerId, 'Provisioner ID is required');
    assert(config.queue, 'Instance of taskcluster queue is required');
    assert(config.log, 'Logger is required');
    this.queues = null;
    this.queue = config.queue;
    this.workerType = config.workerType;
    this.provisionerId = config.provisionerId;
    this.workerGroup = config.workerGroup;
    this.workerId = config.workerId;
    this.client = config.queue;
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
    debug(`polling for ${capacity} tasks`);
    let result = await this.queue.claimWork(this.provisionerId, this.workerType, {
      tasks: Math.min(capacity, MAX_MESSAGES_PER_REQUEST),
      workerGroup: this.workerGroup,
      workerId: this.workerId
    });

    debug(`claimed ${result.tasks.length} tasks`);

    result.tasks.forEach(claim => {
      this.log('claimed task', {
        taskId: claim.status.taskId,
        runId: claim.runId
      });
    });
    return result.tasks;
  }
}

module.exports = TaskQueue;
