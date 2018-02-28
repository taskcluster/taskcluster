export default class Artifact {
  constructor(taskId, data, runId) {
    Object.assign(this, data);
    this.taskId = taskId;

    if (runId) {
      this.runId = runId;
    }
  }
}
