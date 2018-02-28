import Artifact from './Artifact';

export default class Artifacts {
  constructor(taskId, runId, { artifacts, ...data }) {
    Object.assign(this, data);
    this.taskId = taskId;

    if (runId) {
      this.runId = runId;
    }

    this.items = artifacts.map(
      artifact => new Artifact(taskId, artifact, runId)
    );
  }
}
