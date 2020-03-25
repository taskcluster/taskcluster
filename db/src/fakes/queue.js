const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');

class FakeQueue {
  constructor() {
    this.messages = new Map();
    this.queueTasks = new Map();
    this.queueArtifacts = new Map();
    this.queueTaskGroups = new Map();
    this.queueTaskGroupMembers = new Map();
    this.queueTaskGroupActiveMaps = new Map();
    this.queueTaskRequirements = new Map();
    this.queueTaskDependencys = new Map();
    this.queueWorkers = new Map();
    this.queueWorkerTypes = new Map();
    this.queueProvisioners = new Map();

  }

  /* helpers */

  reset() {
    this.messages = new Map();
    this.queueTasks = new Map();
    this.queueArtifacts = new Map();
    this.queueTaskGroups = new Map();
    this.queueTaskGroupMembers = new Map();
    this.queueTaskGroupActiveMaps = new Map();
    this.queueTaskRequirements = new Map();
    this.queueTaskDependencys = new Map();
    this.queueWorkers = new Map();
    this.queueWorkerTypes = new Map();
    this.queueProvisioners = new Map();
  }

  _getQueueTask({ partitionKey, rowKey }) {
    return this.queueTasks.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueTask({ partitionKey, rowKey }) {
    this.queueTasks.delete(`${partitionKey}-${rowKey}`);
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

    this.queueTasks.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueArtifact({ partitionKey, rowKey }) {
    return this.queueArtifacts.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueArtifact({ partitionKey, rowKey }) {
    this.queueArtifacts.delete(`${partitionKey}-${rowKey}`);
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

    this.queueArtifacts.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueTaskGroup({ partitionKey, rowKey }) {
    return this.queueTaskGroups.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueTaskGroup({ partitionKey, rowKey }) {
    this.queueTaskGroups.delete(`${partitionKey}-${rowKey}`);
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

    this.queueTaskGroups.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueTaskGroupMember({ partitionKey, rowKey }) {
    return this.queueTaskGroupMembers.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueTaskGroupMember({ partitionKey, rowKey }) {
    this.queueTaskGroupMembers.delete(`${partitionKey}-${rowKey}`);
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

    this.queueTaskGroupMembers.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueTaskGroupActiveMap({ partitionKey, rowKey }) {
    return this.queueTaskGroupActiveMaps.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueTaskGroupActiveMap({ partitionKey, rowKey }) {
    this.queueTaskGroupActiveMaps.delete(`${partitionKey}-${rowKey}`);
  }

  _addQueueTaskGroupActiveMap(queueTaskGroupActiveMap) {
    assert(typeof queueTaskGroupActiveMap.partition_key === "string");
    assert(typeof queueTaskGroupActiveMap.row_key === "string");
    assert(typeof queueTaskGroupActiveMap.value === "object");
    assert(typeof queueTaskGroupActiveMap.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: queueTaskGroupActiveMap.partition_key,
      row_key_out: queueTaskGroupActiveMap.row_key,
      value: queueTaskGroupActiveMap.value,
      version: queueTaskGroupActiveMap.version,
      etag,
    };

    this.queueTaskGroupActiveMaps.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueTaskRequirement({ partitionKey, rowKey }) {
    return this.queueTaskRequirements.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueTaskRequirement({ partitionKey, rowKey }) {
    this.queueTaskRequirements.delete(`${partitionKey}-${rowKey}`);
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

    this.queueTaskRequirements.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueTaskDependency({ partitionKey, rowKey }) {
    return this.queueTaskDependencys.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueTaskDependency({ partitionKey, rowKey }) {
    this.queueTaskDependencys.delete(`${partitionKey}-${rowKey}`);
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

    this.queueTaskDependencys.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueWorker({ partitionKey, rowKey }) {
    return this.queueWorkers.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueWorker({ partitionKey, rowKey }) {
    this.queueWorkers.delete(`${partitionKey}-${rowKey}`);
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

    this.queueWorkers.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueWorkerType({ partitionKey, rowKey }) {
    return this.queueWorkerTypes.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueWorkerType({ partitionKey, rowKey }) {
    this.queueWorkerTypes.delete(`${partitionKey}-${rowKey}`);
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

    this.queueWorkerTypes.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  _getQueueProvisioner({ partitionKey, rowKey }) {
    return this.queueProvisioners.get(`${partitionKey}-${rowKey}`);
  }

  _removeQueueProvisioner({ partitionKey, rowKey }) {
    this.queueProvisioners.delete(`${partitionKey}-${rowKey}`);
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

    this.queueProvisioners.set(`${c.partition_key_out}-${c.row_key_out}`, c);

    return c;
  }

  getQueueContent(queueName) {
    return this.messages.get(queueName) || [];
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

  async queue_tasks_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueTasks);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_artifacts_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueArtifacts);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_task_groups_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueTaskGroups);

    return entries.slice(offset, offset + size + 1);
  }

  async queue_task_group_active_sets_entities_load(partitionKey, rowKey) {
    const queueTaskGroupActiveMap = this._getQueueTaskGroupActiveMap({ partitionKey, rowKey });

    return queueTaskGroupActiveMap ? [queueTaskGroupActiveMap] : [];
  }

  async queue_task_group_active_sets_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getQueueTaskGroupActiveMap({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const queueTaskGroupActiveMap = this._addQueueTaskGroupActiveMap({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'queue_task_group_active_sets_entities_create': queueTaskGroupActiveMap.etag }];
  }

  async queue_task_group_active_sets_entities_remove(partition_key, row_key) {
    const queueTaskGroupActiveMap = this._getQueueTaskGroupActiveMap({ partitionKey: partition_key, rowKey: row_key });
    this._removeQueueTaskGroupActiveMap({ partitionKey: partition_key, rowKey: row_key });

    return queueTaskGroupActiveMap ? [{ etag: queueTaskGroupActiveMap.etag }] : [];
  }

  async queue_task_group_active_sets_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const queueTaskGroupActiveMap = this._getQueueTaskGroupActiveMap({ partitionKey: partition_key, rowKey: row_key });

    if (!queueTaskGroupActiveMap) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (queueTaskGroupActiveMap.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addQueueTaskGroupActiveMap({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async queue_task_group_active_sets_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({
      partitionKey: partition_key,
      rowKey: row_key,
      condition,
    }, this.queueTaskGroupActiveMaps);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_task_requirement_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueTaskRequirements);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_task_group_members_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueTaskGroupMembers);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_task_dependency_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueTaskDependencys);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_worker_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueWorkers);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_worker_type_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueWorkerTypes);

    return entries.slice(offset, offset + size + 1);
  }

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

  async queue_provisioner_entities_scan(partition_key, row_key, condition, size, offset) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.queueProvisioners);

    return entries.slice(offset, offset + size + 1);
  }

  async azure_queue_count(queue_name) {
    const queue = this.messages.get(queue_name) || [];
    const now = new Date();
    return [{azure_queue_count: queue.filter(({expires}) => expires >= now).length}];
  }

  async azure_queue_put(queue_name, message_text, visible, expires) {
    const queue = this.messages.get(queue_name) || [];
    this.messages.set(queue_name, queue);

    queue.push({message_id: slugid.v4(), message_text, visible, expires});

    return [];
  }

  async azure_queue_delete(queue_name, message_id, pop_receipt) {
    const queue = this.messages.get(queue_name) || [];
    this.messages.set(queue_name,
      queue.filter(msg => msg.message_id !== message_id || msg.pop_receipt !== pop_receipt));
  }

  async azure_queue_update(queue_name, message_text, message_id, pop_receipt, visible) {
    const queue = this.messages.get(queue_name) || [];
    this.messages.set(queue_name,
      queue.map(msg => {
        if (msg.message_id === message_id && msg.pop_receipt === pop_receipt) {
          msg.visible = visible;
          msg.message_text = message_text;
        }
        return msg;
      }));
  }

  async azure_queue_get(queue_name, visible, count) {
    const queue = this.messages.get(queue_name) || [];
    const result = [];
    const now = new Date();

    assert(count >= 1);

    for (let msg of queue) {
      if (msg.visible <= now && msg.expires > now) {
        msg.pop_receipt = slugid.v4();
        msg.visible = visible;
        result.push({
          message_id: msg.message_id,
          message_text: msg.message_text,
          pop_receipt: msg.pop_receipt,
        });
        count--;
        if (count <= 0) {
          break;
        }
      }
    }

    return result;
  }

  async azure_queue_delete_expired() {
    const now = new Date();
    for (let [key, queue] of this.messages) {
      this.messages.set(key, queue.filter(({expires}) => expires > now));
    }
  }
}

module.exports = FakeQueue;
