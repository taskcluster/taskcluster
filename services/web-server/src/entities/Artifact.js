export default class Artifact {
  constructor(taskId, data, runId) {
    Object.assign(this, data);
    this.taskId = taskId;
    this.isPublicLog = /^public\/logs\//.test(this.name);

    if (runId) {
      this.runId = runId;
    }
  }
}
