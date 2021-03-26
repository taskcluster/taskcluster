const assert = require('assert');

class TaskQueue {
  constructor(cfg, queue, monitor, type) {
    assert(queue, 'Instance of taskcluster queue is required');
    this.queue = queue;
    this.builtinType = type;
    this.monitor = monitor;
  }

  async runWorker() {
    while (true) {
      await this.claimTask();
    }
  }

  async claimTask() {
    let result = await this.queue.claimWork(`built-in/${this.builtinType}`, {
      tasks: 1,
      workerGroup: 'built-in',
      workerId: this.builtinType,
    });
    if (result.tasks.length === 0) {
      this.monitor.debug('no tasks');
      return ;
    }
    const { credentials, task, status, runId } = result.tasks[0];
    this.monitor.debug(`claimed task: ${status.taskId}`);

    // use the per-task credentials to make API calls regarding the task
    const queue = this.queue.use({ credentials });

    if (Object.keys(task.payload).length === 0) {
      if (task.taskQueueId === 'built-in/succeed') {
        return await queue.reportCompleted(status.taskId, runId);
      } else if (task.taskQueueId === 'built-in/fail') {
        return await queue.reportFailed(status.taskId, runId);
      }
    } else {
      this.monitor.debug(`task ${status.taskId} has non-empty payload`);
      let payload = {
        reason: 'malformed-payload',
      };
      return await queue.reportException(status.taskId, runId, payload);
    }
  }
}

exports.TaskQueue = TaskQueue;
