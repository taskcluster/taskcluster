const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');

class FakeGithub {
  constructor() {
    this.taskclusterGithubBuilds = new Set();
    this.taskclusterIntergrationOwners = new Set();
    this.taskclusterChecksToTasks = new Set();
    this.taskclusterCheckRuns = new Set();
  }

  /* helpers */

  reset() {
    this.taskclusterGithubBuilds = new Set();
    this.taskclusterIntergrationOwners = new Set();
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

  _getTaskclusterIntergrationOwner({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterIntergrationOwners]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeTaskclusterIntergrationOwner({ partitionKey, rowKey }) {
    for (let c of [...this.taskclusterIntergrationOwners]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.taskclusterIntergrationOwners.delete(c);
        break;
      }
    }
  }

  _addTaskclusterIntergrationOwner(taskclusterIntergrationOwner) {
    assert(typeof taskclusterIntergrationOwner.partition_key === "string");
    assert(typeof taskclusterIntergrationOwner.row_key === "string");
    assert(typeof taskclusterIntergrationOwner.value === "object");
    assert(typeof taskclusterIntergrationOwner.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: taskclusterIntergrationOwner.partition_key,
      row_key_out: taskclusterIntergrationOwner.row_key,
      value: taskclusterIntergrationOwner.value,
      version: taskclusterIntergrationOwner.version,
      etag,
    };

    this._removeTaskclusterIntergrationOwner({
      partitionKey: taskclusterIntergrationOwner.partition_key,
      rowKey: taskclusterIntergrationOwner.row_key,
    });
    this.taskclusterIntergrationOwners.add(c);

    return c;
  }

  /* fake functions */

  async taskcluster_github_builds_entities_load(partitionKey, rowKey) {
    const taskclusterGithubBuild = this._getTaskclusterGithubBuild({ partitionKey, rowKey });

    return taskclusterGithubBuild ? [taskclusterGithubBuild] : [];
  }

  async taskcluster_github_builds_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterGithubBuild = this._addTaskclusterGithubBuild({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'taskcluster_github_builds_entities_create': taskclusterGithubBuild.etag }];
  }

  async taskcluster_github_builds_entities_remove(partition_key, row_key) {
    const taskclusterGithubBuild = this._getTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key });
    this._removeTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterGithubBuild ? [{ etag: taskclusterGithubBuild.etag }] : [];
  }

  async taskcluster_github_builds_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterGithubBuild = this._getTaskclusterGithubBuild({ partitionKey: partition_key, rowKey: row_key });

    if (!taskclusterGithubBuild) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (taskclusterGithubBuild.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addTaskclusterGithubBuild({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async taskcluster_github_builds_entities_scan(partition_key, row_key, condition, size, page) {}

  async taskcluster_intergration_owners_entities_load(partitionKey, rowKey) {
    const taskclusterIntergrationOwner = this._getTaskclusterIntergrationOwner({ partitionKey, rowKey });

    return taskclusterIntergrationOwner ? [taskclusterIntergrationOwner] : [];
  }

  async taskcluster_intergration_owners_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getTaskclusterIntergrationOwner({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterIntergrationOwner = this._addTaskclusterIntergrationOwner({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'taskcluster_intergration_owners_entities_create': taskclusterIntergrationOwner.etag }];
  }

  async taskcluster_intergration_owners_entities_remove(partition_key, row_key) {
    const taskclusterIntergrationOwner = this._getTaskclusterIntergrationOwner({
      partitionKey: partition_key,
      rowKey: row_key,
    });
    this._removeTaskclusterIntergrationOwner({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterIntergrationOwner ? [{ etag: taskclusterIntergrationOwner.etag }] : [];
  }

  async taskcluster_intergration_owners_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterIntergrationOwner = this._getTaskclusterIntergrationOwner({
      partitionKey: partition_key,
      rowKey: row_key,
    });

    if (!taskclusterIntergrationOwner) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (taskclusterIntergrationOwner.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addTaskclusterIntergrationOwner({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async taskcluster_intergration_owners_entities_scan(partition_key, row_key, condition, size, page) {}

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
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterChecksToTask = this._addTaskclusterChecksToTask({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'taskcluster_checks_to_tasks_entities_create': taskclusterChecksToTask.etag }];
  }

  async taskcluster_checks_to_tasks_entities_remove(partition_key, row_key) {
    const taskclusterChecksToTask = this._getTaskclusterChecksToTask({ partitionKey: partition_key, rowKey: row_key });
    this._removeTaskclusterChecksToTask({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterChecksToTask ? [{ etag: taskclusterChecksToTask.etag }] : [];
  }

  async taskcluster_checks_to_tasks_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterChecksToTask = this._getTaskclusterChecksToTask({ partitionKey: partition_key, rowKey: row_key });

    if (!taskclusterChecksToTask) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (taskclusterChecksToTask.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addTaskclusterChecksToTask({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async taskcluster_checks_to_tasks_entities_scan(partition_key, row_key, condition, size, page) {}

  async taskcluster_check_runs_entities_load(partitionKey, rowKey) {
    const taskclusterCheckRun = this._getTaskclusterCheckRun({ partitionKey, rowKey });

    return taskclusterCheckRun ? [taskclusterCheckRun] : [];
  }

  async taskcluster_check_runs_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const taskclusterCheckRun = this._addTaskclusterCheckRun({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'taskcluster_check_runs_entities_create': taskclusterCheckRun.etag }];
  }

  async taskcluster_check_runs_entities_remove(partition_key, row_key) {
    const taskclusterCheckRun = this._getTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key });
    this._removeTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key });

    return taskclusterCheckRun ? [{ etag: taskclusterCheckRun.etag }] : [];
  }

  async taskcluster_check_runs_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const taskclusterCheckRun = this._getTaskclusterCheckRun({ partitionKey: partition_key, rowKey: row_key });

    if (!taskclusterCheckRun) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (taskclusterCheckRun.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addTaskclusterCheckRun({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  // TODO
  async taskcluster_check_runs_entities_scan(partition_key, row_key, condition, size, page) {}
}

module.exports = FakeGithub;
