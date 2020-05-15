module.exports = class Artifact {
  constructor(taskId, data, runId) {
    Object.assign(this, data);
    this.taskId = taskId;
    this.isPublic = /^public\//.test(this.name);
    // bug 1638047 - limit log viewer to public text/plain *.log files
    this.isLog = /^text\/plain.*/.test(this.contentType) && /\.log$/.test(this.name);

    if (runId) {
      this.runId = runId;
    }
  }
};
