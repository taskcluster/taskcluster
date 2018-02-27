import Connection from './Connection';

export default class Artifacts {
  constructor(taskId, runId, artifacts) {
    this.taskId = taskId;

    if (runId) {
      this.runId = runId;
    }

    return new Connection({
      continuationToken: '',
      previousContinuationToken: null,
      items: artifacts,
    });
  }
}
