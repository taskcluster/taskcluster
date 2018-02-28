import Task from './Task';

export default class TaskGroup {
  constructor(taskGroupId, { tasks, ...data }) {
    Object.assign(this, data);
    this.taskGroupId = taskGroupId;
    this.items = tasks.map(
      ({ task, status }) => new Task(status.taskId, status, task)
    );
  }
}
