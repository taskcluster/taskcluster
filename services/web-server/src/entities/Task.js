const TaskStatus = require('./TaskStatus');

module.exports = class Task {
  constructor(taskId, status, data) {
    this.taskId = taskId;

    // sometimes a `status` attribute is snuck into the definition, so ignore
    // that
    const { status: _, ...rawDefinition } = data;
    this.rawDefinition = rawDefinition;

    if (status || data.status) {
      this.status = new TaskStatus(taskId, status || data.status);
    }

    Object.assign(this, data);
  }
};
