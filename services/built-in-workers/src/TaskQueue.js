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
    const task = result.tasks[0];
    this.monitor.debug(`claimed task: ${task.status.taskId}`);
    if (Object.keys(task.task.payload).length === 0) {
      if (task.task.taskQueueId === 'built-in/succeed') {
        return await this.queue.reportCompleted(task.status.taskId, task.runId);
      } else if (task.task.taskQueueId === 'built-in/fail') {
        return await this.queue.reportFailed(task.status.taskId, task.runId);
      }
    } else {
      this.monitor.debug(`task ${task.status.taskId} has non-empty payload`);
      let payload = {
        reason: 'malformed-payload',
      };
      return await this.queue.reportException(task.status.taskId, task.runId, payload);
    }
  }
}

exports.TaskQueue = TaskQueue;
