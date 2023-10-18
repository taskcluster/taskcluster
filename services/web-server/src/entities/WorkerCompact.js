export default class WorkerCompact {
  constructor(provisionerId, workerType, data) {
    Object.assign(this, data);
    this.provisionerId = provisionerId;
    this.workerType = workerType;
  }
}
