export default class Artifact {
  constructor(taskId, runId, data, url) {
    this.taskId = taskId;
    this.runId = runId;
    Object.assign(this, data);

    if (url) {
      this.url = url;
    }
  }
}
