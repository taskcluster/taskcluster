const assert = require("assert");
const slugid = require("slugid");
const { UNIQUE_VIOLATION } = require("taskcluster-lib-postgres");
const { getEntries } = require("../utils");

class FakeGithub {
  constructor() {
    this.taskclusterGithubBuilds = new Set();
    this.taskclusterIntegrationOwners = new Set();
    this.taskclusterChecksToTasks = new Set();
    this.taskclusterCheckRuns = new Set();
  }

  /* helpers */

  reset() {
    this.taskclusterGithubBuilds = new Set();
    this.taskclusterIntegrationOwners = new Set();
    this.taskclusterChecksToTasks = new Set();
    this.taskclusterCheckRuns = new Set();
  }

  _getTaskclusterGithubBuild({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterGithubBuilds]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeTaskclusterGithubBuild({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterGithubBuilds]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.taskclusterGithubBuilds.delete(c);
        break;
      }
    }
  }

  _addTaskclusterGithubBuild(taskclusterGithubBuild) {
    assert(typeof taskclusterGithubBuild.partition_key === "string");
    assert(typeof taskclusterGithubBuild.row_key === "string");
    assert(typeof taskclusterGithubBuild.value === "object");
    assert(typeof taskclusterGithubBuild.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: taskclusterGithubBuild.partition_key,
      row_key_out: taskclusterGithubBuild.row_key,
      value: taskclusterGithubBuild.value,
      version: taskclusterGithubBuild.version,
      etag,
    };

    this._removeTaskclusterGithubBuild({
      partitionKey: taskclusterGithubBuild.partition_key,
      rowKey: taskclusterGithubBuild.row_key,
    });
    this.taskclusterGithubBuilds.add(c);

    return c;
  }

  _getTaskclusterIntegrationOwner({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterIntegrationOwners]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeTaskclusterIntegrationOwner({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterIntegrationOwners]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.taskclusterIntegrationOwners.delete(c);
        break;
      }
    }
  }

  _addTaskclusterIntegrationOwner(taskclusterIntegrationOwner) {
    assert(typeof taskclusterIntegrationOwner.partition_key === "string");
    assert(typeof taskclusterIntegrationOwner.row_key === "string");
    assert(typeof taskclusterIntegrationOwner.value === "object");
    assert(typeof taskclusterIntegrationOwner.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: taskclusterIntegrationOwner.partition_key,
      row_key_out: taskclusterIntegrationOwner.row_key,
      value: taskclusterIntegrationOwner.value,
      version: taskclusterIntegrationOwner.version,
      etag,
    };

    this._removeTaskclusterIntegrationOwner({
      partitionKey: taskclusterIntegrationOwner.partition_key,
      rowKey: taskclusterIntegrationOwner.row_key,
    });
    this.taskclusterIntegrationOwners.add(c);

    return c;
  }

  /* fake functions */

  async taskcluster_github_builds_entities_load(partitionKey, rowKey) {
    const taskclusterGithubBuild = this._getTaskclusterGithubBuild({ partitionKey, rowKey });

    return taskclusterGithubBuild ? [taskclusterGithubBuild] : [];
  }

  async taskcluster_github_builds_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterGithubBuild = this._addTaskclusterGithubBuild({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "taskcluster_github_builds_entities_create": taskclusterGithubBuild.etag }];
  }

  async taskcluster_github_builds_entities_remove(partition_key, row_key) {
    const taskclusterGithubBuild = this._getTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key });
    this._removeTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterGithubBuild ? [{ etag: taskclusterGithubBuild.etag }] : [];
  }

  async taskcluster_github_builds_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterGithubBuild = this._getTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key });

    if (!taskclusterGithubBuild) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (taskclusterGithubBuild.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addTaskclusterGithubBuild({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async taskcluster_github_builds_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({
      partitionKey: partition_key,
      rowKey: row_key,
      condition,
    }, this.taskclusterGithubBuilds);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }

  async taskcluster_integration_owners_entities_load(partitionKey, rowKey) {
    const taskclusterIntegrationOwner = this._getTaskclusterIntegrationOwner({ partitionKey, rowKey });

    return taskclusterIntegrationOwner ? [taskclusterIntegrationOwner] : [];
  }

  async taskcluster_integration_owners_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getTaskclusterIntegrationOwner({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterIntegrationOwner = this._addTaskclusterIntegrationOwner({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "taskcluster_integration_owners_entities_create": taskclusterIntegrationOwner.etag }];
  }

  async taskcluster_integration_owners_entities_remove(partition_key, row_key) {
    const taskclusterIntegrationOwner = this._getTaskclusterIntegrationOwner({
      partitionKey: partition_key,
      rowKey: row_key,
    });
    this._removeTaskclusterIntegrationOwner({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterIntegrationOwner ? [{ etag: taskclusterIntegrationOwner.etag }] : [];
  }

  async taskcluster_integration_owners_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterIntegrationOwner = this._getTaskclusterIntegrationOwner({
      partitionKey: partition_key,
      rowKey: row_key,
    });

    if (!taskclusterIntegrationOwner) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (taskclusterIntegrationOwner.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addTaskclusterIntegrationOwner({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async taskcluster_integration_owners_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({
      partitionKey: partition_key,
      rowKey: row_key,
      condition,
    }, this.taskclusterIntegrationOwners);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }

  _getTaskclusterChecksToTask({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterChecksToTasks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeTaskclusterChecksToTask({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterChecksToTasks]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.taskclusterChecksToTasks.delete(c);
        break;
      }
    }
  }

  _addTaskclusterChecksToTask(taskclusterChecksToTask) {
    assert(typeof taskclusterChecksToTask.partition_key === "string");
    assert(typeof taskclusterChecksToTask.row_key === "string");
    assert(typeof taskclusterChecksToTask.value === "object");
    assert(typeof taskclusterChecksToTask.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: taskclusterChecksToTask.partition_key,
      row_key_out: taskclusterChecksToTask.row_key,
      value: taskclusterChecksToTask.value,
      version: taskclusterChecksToTask.version,
      etag,
    };

    this._removeTaskclusterChecksToTask({
      partitionKey: taskclusterChecksToTask.partition_key,
      rowKey: taskclusterChecksToTask.row_key,
    });
    this.taskclusterChecksToTasks.add(c);

    return c;
  }

  _getTaskclusterCheckRun({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterCheckRuns]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeTaskclusterCheckRun({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterCheckRuns]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.taskclusterCheckRuns.delete(c);
        break;
      }
    }
  }

  _addTaskclusterCheckRun(taskclusterCheckRun) {
    assert(typeof taskclusterCheckRun.partition_key === "string");
    assert(typeof taskclusterCheckRun.row_key === "string");
    assert(typeof taskclusterCheckRun.value === "object");
    assert(typeof taskclusterCheckRun.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: taskclusterCheckRun.partition_key,
      row_key_out: taskclusterCheckRun.row_key,
      value: taskclusterCheckRun.value,
      version: taskclusterCheckRun.version,
      etag,
    };

    this._removeTaskclusterCheckRun({
      partitionKey: taskclusterCheckRun.partition_key,
      rowKey: taskclusterCheckRun.row_key,
    });
    this.taskclusterCheckRuns.add(c);

    return c;
  }

  /* fake functions */

  async taskcluster_checks_to_tasks_entities_load(partitionKey, rowKey) {
    const taskclusterChecksToTask = this._getTaskclusterChecksToTask({ partitionKey, rowKey });

    return taskclusterChecksToTask ? [taskclusterChecksToTask] : [];
  }

  async taskcluster_checks_to_tasks_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getTaskclusterChecksToTask({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterChecksToTask = this._addTaskclusterChecksToTask({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "taskcluster_checks_to_tasks_entities_create": taskclusterChecksToTask.etag }];
  }

  async taskcluster_checks_to_tasks_entities_remove(partition_key, row_key) {
    const taskclusterChecksToTask = this._getTaskclusterChecksToTask({ partitionKey: partition_key, rowKey: row_key });
    this._removeTaskclusterChecksToTask({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterChecksToTask ? [{ etag: taskclusterChecksToTask.etag }] : [];
  }

  async taskcluster_checks_to_tasks_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterChecksToTask = this._getTaskclusterChecksToTask({ partitionKey: partition_key, rowKey: row_key });

    if (!taskclusterChecksToTask) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (taskclusterChecksToTask.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addTaskclusterChecksToTask({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async taskcluster_checks_to_tasks_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({
      partitionKey: partition_key,
      rowKey: row_key,
      condition,
    }, this.taskclusterChecksToTasks);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }

  async taskcluster_check_runs_entities_load(partitionKey, rowKey) {
    const taskclusterCheckRun = this._getTaskclusterCheckRun({ partitionKey, rowKey });

    return taskclusterCheckRun ? [taskclusterCheckRun] : [];
  }

  async taskcluster_check_runs_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterCheckRun = this._addTaskclusterCheckRun({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "taskcluster_check_runs_entities_create": taskclusterCheckRun.etag }];
  }

  async taskcluster_check_runs_entities_remove(partition_key, row_key) {
    const taskclusterCheckRun = this._getTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key });
    this._removeTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterCheckRun ? [{ etag: taskclusterCheckRun.etag }] : [];
  }

  async taskcluster_check_runs_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterCheckRun = this._getTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key });

    if (!taskclusterCheckRun) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (taskclusterCheckRun.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addTaskclusterCheckRun({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async taskcluster_check_runs_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.taskclusterCheckRuns);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }
}

module.exports = FakeGithub;
