import Connection from './Connection';
import Task from './Task';

export default class TaskGroup {
  constructor(taskGroupId, continuationToken, data) {
    this.taskGroupId = taskGroupId;
    this.tasks = new Connection({
      continuationToken: data.continuationToken,
      previousContinuationToken: continuationToken,
      items: data.tasks.map(
        ({ task, status }) => new Task(status.taskId, status, task)
      ),
    });
  }
}
