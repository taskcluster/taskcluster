export default class Artifact {
  constructor(taskId, data, runId) {
    this.taskId = taskId;

    if (runId) {
      this.runId = runId;
    }

    Object.assign(this, data);
  }
}
