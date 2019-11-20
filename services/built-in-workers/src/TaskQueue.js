const assert = require('assert');
class TaskQueue {
  constructor(cfg, queue, type) {
    assert(queue, 'Instance of taskcluster queue is required');
    this.queue = queue;
    this.workerType = type;
    this.provisionerId = cfg.worker.provisionerId;
    this.workerGroup = cfg.worker.workerGroup;
    this.workerId = type;
  }

  async runWorker() {
    while (true) {
      await this.claimTask();
    }
  }

  async claimTask() {
    let result = await this.queue.claimWork(this.provisionerId, this.workerType, {
      tasks: 1,
      workerGroup: this.workerGroup,
      workerId: this.workerId,
    });
    if (result.tasks.length === 0) {
      return ;
    }
    const task = result.tasks[0];
    if (Object.keys(task.task.payload).length === 0) {
      if (task.task.workerType === 'succeed') {
        return await this.queue.reportCompleted(task.status.taskId, task.runId);
      } else if (task.task.workerType === 'fail') {
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
