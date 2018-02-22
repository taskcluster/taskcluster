import Artifact from './Artifact';

export default class TaskRun {
  constructor(taskId, data, artifacts) {
    this.taskId = taskId;
    Object.assign(this, data);

    if (artifacts) {
      this.artifacts = artifacts.map(
        artifact => new Artifact(taskId, this.runId, artifact)
      );
    }
  }
}
