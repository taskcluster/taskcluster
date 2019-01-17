import TaskStatus from './TaskStatus';

export default class Task {
  constructor(taskId, status, data) {
    this.taskId = taskId;

    if (status || data.status) {
      this.status = new TaskStatus(taskId, status || data.status);
    }

    Object.assign(this, data);
  }
}
