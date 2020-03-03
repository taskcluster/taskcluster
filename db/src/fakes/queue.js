const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

class FakeQueue {
  constructor() {
    this.queueTasks = new Set();
    this.queueArtifacts = new Set();
    this.queueTaskGroups = new Set();
    this.queueTaskGroupMembers = new Set();
    this.queueTaskGroupActiveSets = new Set();
    this.queueTaskRequirements = new Set();
    this.queueTaskDependencys = new Set();
    this.queueWorkers = new Set();
    this.queueWorkerTypes = new Set();
    this.queueProvisioners = new Set();
  }

  /* helpers */

  reset() {
    this.queueTasks = new Set();
    this.queueArtifacts = new Set();
    this.queueTaskGroups = new Set();
    this.queueTaskGroupMembers = new Set();
    this.queueTaskGroupActiveSets = new Set();
    this.queueTaskRequirements = new Set();
    this.queueTaskDependencys = new Set();
    this.queueWorkers = new Set();
    this.queueWorkerTypes = new Set();
    this.queueProvisioners = new Set();
  }

  _getQueueTask({ partitionKey, rowKey }) {
    for (let c of [...this.queueTasks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueTask({ partitionKey, rowKey }) {
    for (let c of [...this.queueTasks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueTasks.delete(c);
        break;
      }
    }
  }

  _addQueueTask(queueTask) {
    assert(typeof queueTask.partition_key === "string");
    assert(typeof queueTask.row_key === "string");
    assert(typeof queueTask.value === "object");
    assert(typeof queueTask.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueTask.partition_key,
      row_key_out: queueTask.row_key,
      value: queueTask.value,
      version: queueTask.version,
      etag,
    };

    this._removeQueueTask({
      partitionKey: queueTask.partition_key,
      rowKey: queueTask.row_key,
    });
    this.queueTasks.add(c);

    return c;
  }

  _getQueueArtifact({ partitionKey, rowKey }) {
    for (let c of [...this.queueArtifacts]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueArtifact({ partitionKey, rowKey }) {
    for (let c of [...this.queueArtifacts]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueArtifacts.delete(c);
        break;
      }
    }
  }

  _addQueueArtifact(queueArtifact) {
    assert(typeof queueArtifact.partition_key === "string");
    assert(typeof queueArtifact.row_key === "string");
    assert(typeof queueArtifact.value === "object");
    assert(typeof queueArtifact.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueArtifact.partition_key,
      row_key_out: queueArtifact.row_key,
      value: queueArtifact.value,
      version: queueArtifact.version,
      etag,
    };

    this._removeQueueArtifact({
      partitionKey: queueArtifact.partition_key,
      rowKey: queueArtifact.row_key,
    });
    this.queueArtifacts.add(c);

    return c;
  }

  _getQueueTaskGroup({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskGroups]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueTaskGroup({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskGroups]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueTaskGroups.delete(c);
        break;
      }
    }
  }

  _addQueueTaskGroup(queueTaskGroup) {
    assert(typeof queueTaskGroup.partition_key === "string");
    assert(typeof queueTaskGroup.row_key === "string");
    assert(typeof queueTaskGroup.value === "object");
    assert(typeof queueTaskGroup.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueTaskGroup.partition_key,
      row_key_out: queueTaskGroup.row_key,
      value: queueTaskGroup.value,
      version: queueTaskGroup.version,
      etag,
    };

    this._removeQueueTaskGroup({
      partitionKey: queueTaskGroup.partition_key,
      rowKey: queueTaskGroup.row_key,
    });
    this.queueTaskGroups.add(c);

    return c;
  }

  _getQueueTaskGroupMember({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskGroupMembers]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueTaskGroupMember({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskGroupMembers]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueTaskGroupMembers.delete(c);
        break;
      }
    }
  }

  _addQueueTaskGroupMember(queueTaskGroupMember) {
    assert(typeof queueTaskGroupMember.partition_key === "string");
    assert(typeof queueTaskGroupMember.row_key === "string");
    assert(typeof queueTaskGroupMember.value === "object");
    assert(typeof queueTaskGroupMember.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueTaskGroupMember.partition_key,
      row_key_out: queueTaskGroupMember.row_key,
      value: queueTaskGroupMember.value,
      version: queueTaskGroupMember.version,
      etag,
    };

    this._removeQueueTaskGroupMember({
      partitionKey: queueTaskGroupMember.partition_key,
      rowKey: queueTaskGroupMember.row_key,
    });
    this.queueTaskGroupMembers.add(c);

    return c;
  }

  _getQueueTaskGroupActiveSet({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskGroupActiveSets]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueTaskGroupActiveSet({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskGroupActiveSets]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueTaskGroupActiveSets.delete(c);
        break;
      }
    }
  }

  _addQueueTaskGroupActiveSet(queueTaskGroupActiveSet) {
    assert(typeof queueTaskGroupActiveSet.partition_key === "string");
    assert(typeof queueTaskGroupActiveSet.row_key === "string");
    assert(typeof queueTaskGroupActiveSet.value === "object");
    assert(typeof queueTaskGroupActiveSet.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueTaskGroupActiveSet.partition_key,
      row_key_out: queueTaskGroupActiveSet.row_key,
      value: queueTaskGroupActiveSet.value,
      version: queueTaskGroupActiveSet.version,
      etag,
    };

    this._removeQueueTaskGroupActiveSet({
      partitionKey: queueTaskGroupActiveSet.partition_key,
      rowKey: queueTaskGroupActiveSet.row_key,
    });
    this.queueTaskGroupActiveSets.add(c);

    return c;
  }

  _getQueueTaskRequirement({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskRequirements]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueTaskRequirement({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskRequirements]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueTaskRequirements.delete(c);
        break;
      }
    }
  }

  _addQueueTaskRequirement(queueTaskRequirement) {
    assert(typeof queueTaskRequirement.partition_key === "string");
    assert(typeof queueTaskRequirement.row_key === "string");
    assert(typeof queueTaskRequirement.value === "object");
    assert(typeof queueTaskRequirement.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueTaskRequirement.partition_key,
      row_key_out: queueTaskRequirement.row_key,
      value: queueTaskRequirement.value,
      version: queueTaskRequirement.version,
      etag,
    };

    this._removeQueueTaskRequirement({
      partitionKey: queueTaskRequirement.partition_key,
      rowKey: queueTaskRequirement.row_key,
    });
    this.queueTaskRequirements.add(c);

    return c;
  }

  _getQueueTaskDependency({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskDependencys]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueTaskDependency({ partitionKey, rowKey }) {
    for (let c of [...this.queueTaskDependencys]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueTaskDependencys.delete(c);
        break;
      }
    }
  }

  _addQueueTaskDependency(queueTaskDependency) {
    assert(typeof queueTaskDependency.partition_key === "string");
    assert(typeof queueTaskDependency.row_key === "string");
    assert(typeof queueTaskDependency.value === "object");
    assert(typeof queueTaskDependency.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueTaskDependency.partition_key,
      row_key_out: queueTaskDependency.row_key,
      value: queueTaskDependency.value,
      version: queueTaskDependency.version,
      etag,
    };

    this._removeQueueTaskDependency({
      partitionKey: queueTaskDependency.partition_key,
      rowKey: queueTaskDependency.row_key,
    });
    this.queueTaskDependencys.add(c);

    return c;
  }

  _getQueueWorker({ partitionKey, rowKey }) {
    for (let c of [...this.queueWorkers]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueWorker({ partitionKey, rowKey }) {
    for (let c of [...this.queueWorkers]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueWorkers.delete(c);
        break;
      }
    }
  }

  _addQueueWorker(queueWorker) {
    assert(typeof queueWorker.partition_key === "string");
    assert(typeof queueWorker.row_key === "string");
    assert(typeof queueWorker.value === "object");
    assert(typeof queueWorker.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueWorker.partition_key,
      row_key_out: queueWorker.row_key,
      value: queueWorker.value,
      version: queueWorker.version,
      etag,
    };

    this._removeQueueWorker({
      partitionKey: queueWorker.partition_key,
      rowKey: queueWorker.row_key,
    });
    this.queueWorkers.add(c);

    return c;
  }

  _getQueueWorkerType({ partitionKey, rowKey }) {
    for (let c of [...this.queueWorkerTypes]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueWorkerType({ partitionKey, rowKey }) {
    for (let c of [...this.queueWorkerTypes]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueWorkerTypes.delete(c);
        break;
      }
    }
  }

  _addQueueWorkerType(queueWorkerType) {
    assert(typeof queueWorkerType.partition_key === "string");
    assert(typeof queueWorkerType.row_key === "string");
    assert(typeof queueWorkerType.value === "object");
    assert(typeof queueWorkerType.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueWorkerType.partition_key,
      row_key_out: queueWorkerType.row_key,
      value: queueWorkerType.value,
      version: queueWorkerType.version,
      etag,
    };

    this._removeQueueWorkerType({ partitionKey: queueWorkerType.partition_key, rowKey: queueWorkerType.row_key });
    this.queueWorkerTypes.add(c);

    return c;
  }

  _getQueueProvisioner({ partitionKey, rowKey }) {
    for (let c of [...this.queueProvisioners]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeQueueProvisioner({ partitionKey, rowKey }) {
    for (let c of [...this.queueProvisioners]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.queueProvisioners.delete(c);
        break;
      }
    }
  }

  _addQueueProvisioner(queueProvisioner) {
    assert(typeof queueProvisioner.partition_key === "string");
    assert(typeof queueProvisioner.row_key === "string");
    assert(typeof queueProvisioner.value === "object");
    assert(typeof queueProvisioner.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueProvisioner.partition_key,
      row_key_out: queueProvisioner.row_key,
      value: queueProvisioner.value,
      version: queueProvisioner.version,
      etag,
    };

    this._removeQueueProvisioner({ partitionKey: queueProvisioner.partition_key, rowKey: queueProvisioner.row_key });
    this.queueProvisioners.add(c);

    return c;
  }

  /* fake functions */

  async queue_tasks_entities_load(partitionKey, rowKey) {
    const queueTask = this._getQueueTask({ partitionKey, rowKey });

    return queueTask ? [queueTask] : [];
  }

  async queue_tasks_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueTask({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueTask = this._addQueueTask({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_tasks_entities_create': queueTask.etag }];
  }

  async queue_tasks_entities_remove(partition_key, row_key) {
    const queueTask = this._getQueueTask({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueTask({ partitionKey: partition_key, rowKey: row_key });

    return queueTask ? [{ etag: queueTask.etag }] : [];
  }

  async queue_tasks_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueTask = this._getQueueTask({ partitionKey: partition_key, rowKey: row_key });

    if (!queueTask) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueTask.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueTask({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_tasks_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_artifacts_entities_load(partitionKey, rowKey) {
    const queueArtifact = this._getQueueArtifact({ partitionKey, rowKey });

    return queueArtifact ? [queueArtifact] : [];
  }

  async queue_artifacts_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueArtifact({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueArtifact = this._addQueueArtifact({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_artifacts_entities_create': queueArtifact.etag }];
  }

  async queue_artifacts_entities_remove(partition_key, row_key) {
    const queueArtifact = this._getQueueArtifact({
      partitionKey: partition_key,
      rowKey: row_key,
    });
    this._removeQueueArtifact({ partitionKey: partition_key, rowKey: row_key });

    return queueArtifact ? [{ etag: queueArtifact.etag }] : [];
  }

  async queue_artifacts_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueArtifact = this._getQueueArtifact({
      partitionKey: partition_key,
      rowKey: row_key,
    });

    if (!queueArtifact) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueArtifact.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueArtifact({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_artifacts_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_task_groups_entities_load(partitionKey, rowKey) {
    const queueTaskGroup = this._getQueueTaskGroup({ partitionKey, rowKey });

    return queueTaskGroup ? [queueTaskGroup] : [];
  }

  async queue_task_groups_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueTaskGroup({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueTaskGroup = this._addQueueTaskGroup({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_task_groups_entities_create': queueTaskGroup.etag }];
  }

  async queue_task_groups_entities_remove(partition_key, row_key) {
    const queueTaskGroup = this._getQueueTaskGroup({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueTaskGroup({ partitionKey: partition_key, rowKey: row_key });

    return queueTaskGroup ? [{ etag: queueTaskGroup.etag }] : [];
  }

  async queue_task_groups_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueTaskGroup = this._getQueueTaskGroup({ partitionKey: partition_key, rowKey: row_key });

    if (!queueTaskGroup) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueTaskGroup.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueTaskGroup({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_task_groups_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_task_group_active_sets_entities_load(partitionKey, rowKey) {
    const queueTaskGroupActiveSet = this._getQueueTaskGroupActiveSet({ partitionKey, rowKey });

    return queueTaskGroupActiveSet ? [queueTaskGroupActiveSet] : [];
  }

  async queue_task_group_active_sets_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueTaskGroupActiveSet({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueTaskGroupActiveSet = this._addQueueTaskGroupActiveSet({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_task_group_active_sets_entities_create': queueTaskGroupActiveSet.etag }];
  }

  async queue_task_group_active_sets_entities_remove(partition_key, row_key) {
    const queueTaskGroupActiveSet = this._getQueueTaskGroupActiveSet({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueTaskGroupActiveSet({ partitionKey: partition_key, rowKey: row_key });

    return queueTaskGroupActiveSet ? [{ etag: queueTaskGroupActiveSet.etag }] : [];
  }

  async queue_task_group_active_sets_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueTaskGroupActiveSet = this._getQueueTaskGroupActiveSet({ partitionKey: partition_key, rowKey: row_key });

    if (!queueTaskGroupActiveSet) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueTaskGroupActiveSet.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueTaskGroupActiveSet({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_task_group_active_sets_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_task_requirement_entities_load(partitionKey, rowKey) {
    const queueTaskRequirement = this._getQueueTaskRequirement({ partitionKey, rowKey });

    return queueTaskRequirement ? [queueTaskRequirement] : [];
  }

  async queue_task_requirement_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueTaskRequirement({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueTaskRequirement = this._addQueueTaskRequirement({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_task_requirement_entities_create': queueTaskRequirement.etag }];
  }

  async queue_task_requirement_entities_remove(partition_key, row_key) {
    const queueTaskRequirement = this._getQueueTaskRequirement({
      partitionKey: partition_key,
      rowKey: row_key,
    });
    this._removeQueueTaskRequirement({ partitionKey: partition_key, rowKey: row_key });

    return queueTaskRequirement ? [{ etag: queueTaskRequirement.etag }] : [];
  }

  async queue_task_requirement_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueTaskRequirement = this._getQueueTaskRequirement({
      partitionKey: partition_key,
      rowKey: row_key,
    });

    if (!queueTaskRequirement) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueTaskRequirement.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueTaskRequirement({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_task_requirement_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_task_group_members_entities_load(partitionKey, rowKey) {
    const queueTaskGroupMember = this._getQueueTaskGroupMember({ partitionKey, rowKey });

    return queueTaskGroupMember ? [queueTaskGroupMember] : [];
  }

  async queue_task_group_members_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueTaskGroupMember({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueTaskGroupMember = this._addQueueTaskGroupMember({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_task_group_members_entities_create': queueTaskGroupMember.etag }];
  }

  async queue_task_group_members_entities_remove(partition_key, row_key) {
    const queueTaskGroupMember = this._getQueueTaskGroupMember({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueTaskGroupMember({ partitionKey: partition_key, rowKey: row_key });

    return queueTaskGroupMember ? [{ etag: queueTaskGroupMember.etag }] : [];
  }

  async queue_task_group_members_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueTaskGroupMember = this._getQueueTaskGroupMember({ partitionKey: partition_key, rowKey: row_key });

    if (!queueTaskGroupMember) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueTaskGroupMember.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueTaskGroupMember({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_task_group_members_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_task_dependency_entities_load(partitionKey, rowKey) {
    const queueTaskDependency = this._getQueueTaskDependency({ partitionKey, rowKey });

    return queueTaskDependency ? [queueTaskDependency] : [];
  }

  async queue_task_dependency_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueTaskDependency({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueTaskDependency = this._addQueueTaskDependency({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_task_dependency_entities_create': queueTaskDependency.etag }];
  }

  async queue_task_dependency_entities_remove(partition_key, row_key) {
    const queueTaskDependency = this._getQueueTaskDependency({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueTaskDependency({ partitionKey: partition_key, rowKey: row_key });

    return queueTaskDependency ? [{ etag: queueTaskDependency.etag }] : [];
  }

  async queue_task_dependency_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueTaskDependency = this._getQueueTaskDependency({ partitionKey: partition_key, rowKey: row_key });

    if (!queueTaskDependency) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueTaskDependency.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueTaskDependency({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_task_dependency_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_worker_entities_load(partitionKey, rowKey) {
    const queueWorker = this._getQueueWorker({ partitionKey, rowKey });

    return queueWorker ? [queueWorker] : [];
  }

  async queue_worker_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueWorker({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueWorker = this._addQueueWorker({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_worker_entities_create': queueWorker.etag }];
  }

  async queue_worker_entities_remove(partition_key, row_key) {
    const queueWorker = this._getQueueWorker({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueWorker({ partitionKey: partition_key, rowKey: row_key });

    return queueWorker ? [{ etag: queueWorker.etag }] : [];
  }

  async queue_worker_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueWorker = this._getQueueWorker({ partitionKey: partition_key, rowKey: row_key });

    if (!queueWorker) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueWorker.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueWorker({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_worker_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_worker_type_entities_load(partitionKey, rowKey) {
    const queueWorkerType = this._getQueueWorkerType({ partitionKey, rowKey });

    return queueWorkerType ? [queueWorkerType] : [];
  }

  async queue_worker_type_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueWorkerType({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueWorkerType = this._addQueueWorkerType({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_worker_type_entities_create': queueWorkerType.etag }];
  }

  async queue_worker_type_entities_remove(partition_key, row_key) {
    const queueWorkerType = this._getQueueWorkerType({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueWorkerType({ partitionKey: partition_key, rowKey: row_key });

    return queueWorkerType ? [{ etag: queueWorkerType.etag }] : [];
  }

  async queue_worker_type_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueWorkerType = this._getQueueWorkerType({ partitionKey: partition_key, rowKey: row_key });

    if (!queueWorkerType) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueWorkerType.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueWorkerType({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_worker_type_entities_scan(partition_key, row_key, condition, size, page) {}

  async queue_provisioner_entities_load(partitionKey, rowKey) {
    const queueProvisioner = this._getQueueProvisioner({ partitionKey, rowKey });

    return queueProvisioner ? [queueProvisioner] : [];
  }

  async queue_provisioner_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueProvisioner({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueProvisioner = this._addQueueProvisioner({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_provisioner_entities_create': queueProvisioner.etag }];
  }

  async queue_provisioner_entities_remove(partition_key, row_key) {
    const queueProvisioner = this._getQueueProvisioner({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueProvisioner({ partitionKey: partition_key, rowKey: row_key });

    return queueProvisioner ? [{ etag: queueProvisioner.etag }] : [];
  }

  async queue_provisioner_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueProvisioner = this._getQueueProvisioner({ partitionKey: partition_key, rowKey: row_key });

    if (!queueProvisioner) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueProvisioner.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueProvisioner({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async queue_provisioner_entities_scan(partition_key, row_key, condition, size, page) {}
}

module.exports = FakeQueue;
