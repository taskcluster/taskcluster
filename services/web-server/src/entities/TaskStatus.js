import TaskRun from './TaskRun';

export default class TaskStatus {
  constructor(taskId, data) {
    this.taskId = taskId;
    Object.assign(this, data);

    if (this.runs) {
      this.runs = this.runs.map(run => new TaskRun(taskId, run));
    }
  }
}
