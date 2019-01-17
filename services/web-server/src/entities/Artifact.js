export default class Artifact {
  constructor(taskId, data, runId) {
    Object.assign(this, data);
    this.taskId = taskId;
    this.isPublic = /^public\//.test(this.name);
    this.isLog = /^text\/*/.test(this.contentType);

    if (runId) {
      this.runId = runId;
    }
  }
}
