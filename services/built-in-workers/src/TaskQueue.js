const assert = require('assert');
class TaskQueue {
  constructor(cfg, queue, type) {
    assert(queue, 'Instance of taskcluster queue is required');
    this.queue = queue;
    this.builtinType = type;
  }

  async runWorker() {
    while (true) {
      await this.claimTask();
    }
  }

  async claimTask() {
    let result = await this.queue.claimWork('built-in', this.builtinType, {
      tasks: 1,
      workerGroup: 'built-in',
      workerId: this.builtinType,
    });
    if (result.tasks.length === 0) {
      return ;
    }
    const task = result.tasks[0];
    if (Object.keys(task.task.payload).length === 0) {
      const taskQueueId = `${task.task.provisionerId}/${task.task.workerType}`;
      if (taskQueueId === 'built-in/succeed') {
        return await this.queue.reportCompleted(task.status.taskId, task.runId);
      } else if (taskQueueId === 'built-in/fail') {
        return await this.queue.reportFailed(task.status.taskId, task.runId);
      }
    } else {
      let payload = {
        reason: 'malformed-payload',
      };
      return await this.queue.reportException(task.status.taskId, task.runId, payload);
    }
  }
}
exports.TaskQueue = TaskQueue;
