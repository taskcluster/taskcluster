const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const _ = require('lodash');

suite(`${testing.suiteName()} - taskclusterGithubBuilds`, function() {
  helper.withDbForProcs({ serviceName: 'github' });

  const taskclusterGithubBuilds = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset taskclusterGithubBuilds table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from taskcluster_github_builds_entities`);
      await client.query(`insert into taskcluster_github_builds_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    await helper.fakeDb.github.reset();
    await helper.fakeDb.github.taskcluster_github_builds_entities_create('foo', 'bar', taskclusterGithubBuilds[0], false, 1);
    await helper.fakeDb.github.taskcluster_github_builds_entities_create('bar', 'foo', taskclusterGithubBuilds[1], false, 1);
  });

  helper.dbTest('taskcluster_github_builds_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_github_builds_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(taskclusterGithubBuilds[0], fooClient.value);
  });

  helper.dbTest('taskcluster_github_builds_entities_create', async function(db, isFake) {
    const [{ taskcluster_github_builds_entities_create: etag }] = await db.fns.taskcluster_github_builds_entities_create('baz', 'gamma', taskclusterGithubBuilds[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.taskcluster_github_builds_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(taskclusterGithubBuilds[2], bazClient.value);
  });

  helper.dbTest('taskcluster_github_builds_entities_create throws when overwrite is false', async function(db, isFake) {
    await db.fns.taskcluster_github_builds_entities_create('baz', 'gamma', taskclusterGithubBuilds[2], false, 1);
    await assert.rejects(
      () => db.fns.taskcluster_github_builds_entities_create('baz', 'gamma', taskclusterGithubBuilds[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('taskcluster_github_builds_entities_create does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.taskcluster_github_builds_entities_create('baz', 'gamma', taskclusterGithubBuilds[2], true, 1);
    await db.fns.taskcluster_github_builds_entities_create('baz', 'gamma', { ...taskclusterGithubBuilds[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.taskcluster_github_builds_entities_load('baz', 'gamma');
    assert.deepEqual({ ...taskclusterGithubBuilds[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('taskcluster_github_builds_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_github_builds_entities_remove('foo', 'bar');
    const c = await db.fns.taskcluster_github_builds_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('taskcluster_github_builds_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_github_builds_entities_load('foo', 'bar');
    const [etag] = await db.fns.taskcluster_github_builds_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.taskcluster_github_builds_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('taskcluster_github_builds_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_github_builds_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_github_builds_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('taskcluster_github_builds_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_github_builds_entities_load('foo', 'bar');
    await db.fns.taskcluster_github_builds_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_github_builds_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });
});

suite(`${testing.suiteName()} - taskclusterIntergrationOwners`, function() {
  helper.withDbForProcs({ serviceName: 'github' });

  const taskclusterIntergrationOwners = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset taskclusterIntergrationOwners table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from taskcluster_intergration_owners_entities`);
      await client.query(`insert into taskcluster_intergration_owners_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    await helper.fakeDb.github.reset();
    await helper.fakeDb.github.taskcluster_intergration_owners_entities_create('foo', 'bar', taskclusterIntergrationOwners[0], false, 1);
    await helper.fakeDb.github.taskcluster_intergration_owners_entities_create('bar', 'foo', taskclusterIntergrationOwners[1], false, 1);
  });

  helper.dbTest('taskcluster_intergration_owners_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_intergration_owners_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(taskclusterIntergrationOwners[0], fooClient.value);
  });

  helper.dbTest('taskcluster_intergration_owners_entities_create', async function(db, isFake) {
    const [{ taskcluster_intergration_owners_entities_create: etag }] = await db.fns.taskcluster_intergration_owners_entities_create('baz', 'gamma', taskclusterIntergrationOwners[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.taskcluster_intergration_owners_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(taskclusterIntergrationOwners[2], bazClient.value);
  });

  helper.dbTest('taskcluster_intergration_owners_entities throws when overwrite is false', async function(db, isFake) {
    await db.fns.taskcluster_intergration_owners_entities_create('baz', 'gamma', taskclusterIntergrationOwners[2], false, 1);
    await assert.rejects(
      () => db.fns.taskcluster_intergration_owners_entities_create('baz', 'gamma', taskclusterIntergrationOwners[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('taskcluster_intergration_owners_entities does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.taskcluster_intergration_owners_entities_create('baz', 'gamma', taskclusterIntergrationOwners[2], true, 1);
    await db.fns.taskcluster_intergration_owners_entities_create('baz', 'gamma', { ...taskclusterIntergrationOwners[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.taskcluster_intergration_owners_entities_load('baz', 'gamma');
    assert.deepEqual({ ...taskclusterIntergrationOwners[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('taskcluster_intergration_owners_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_intergration_owners_entities_remove('foo', 'bar');
    const c = await db.fns.taskcluster_intergration_owners_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('taskcluster_intergration_owners_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_intergration_owners_entities_load('foo', 'bar');
    const [etag] = await db.fns.taskcluster_intergration_owners_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.taskcluster_intergration_owners_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('taskcluster_intergration_owners_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_intergration_owners_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_intergration_owners_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('taskcluster_intergration_owners_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_intergration_owners_entities_load('foo', 'bar');
    await db.fns.taskcluster_intergration_owners_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_intergration_owners_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });

  // TODO : Add test for taskcluster_intergration_owners_entities_scan
});

suite.only(`${testing.suiteName()} - taskclusterChecksToTasks`, function() {
  helper.withDbForProcs({ serviceName: 'github' });

  const taskclusterChecksToTasks = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset taskclusterChecksToTasks table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from taskcluster_checks_to_tasks_entities`);
      await client.query(`insert into taskcluster_checks_to_tasks_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    await helper.fakeDb.github.reset();
    await helper.fakeDb.github.taskcluster_checks_to_tasks_entities_create('foo', 'bar', taskclusterChecksToTasks[0], false, 1);
    await helper.fakeDb.github.taskcluster_checks_to_tasks_entities_create('bar', 'foo', taskclusterChecksToTasks[1], false, 1);
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_checks_to_tasks_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(taskclusterChecksToTasks[0], fooClient.value);
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_create', async function(db, isFake) {
    const [{ taskcluster_checks_to_tasks_entities_create: etag }] = await db.fns.taskcluster_checks_to_tasks_entities_create('baz', 'gamma', taskclusterChecksToTasks[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.taskcluster_checks_to_tasks_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(taskclusterChecksToTasks[2], bazClient.value);
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_create throws when overwrite is false', async function(db, isFake) {
    await db.fns.taskcluster_checks_to_tasks_entities_create('baz', 'gamma', taskclusterChecksToTasks[2], false, 1);
    await assert.rejects(
      () => db.fns.taskcluster_checks_to_tasks_entities_create('baz', 'gamma', taskclusterChecksToTasks[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_create does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.taskcluster_checks_to_tasks_entities_create('baz', 'gamma', taskclusterChecksToTasks[2], true, 1);
    await db.fns.taskcluster_checks_to_tasks_entities_create('baz', 'gamma', { ...taskclusterChecksToTasks[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.taskcluster_checks_to_tasks_entities_load('baz', 'gamma');
    assert.deepEqual({ ...taskclusterChecksToTasks[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_checks_to_tasks_entities_remove('foo', 'bar');
    const c = await db.fns.taskcluster_checks_to_tasks_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_checks_to_tasks_entities_load('foo', 'bar');
    const [etag] = await db.fns.taskcluster_checks_to_tasks_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.taskcluster_checks_to_tasks_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_checks_to_tasks_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_checks_to_tasks_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('taskcluster_checks_to_tasks_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_checks_to_tasks_entities_load('foo', 'bar');
    await db.fns.taskcluster_checks_to_tasks_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_checks_to_tasks_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });
});

suite(`${testing.suiteName()} - taskclusterCheckRuns`, function() {
  helper.withDbForProcs({ serviceName: 'github' });

  const taskclusterCheckRuns = [
    { first: 'foo', last: 'bar' },
    { first: 'bar', last: 'foo' },
    { first: 'baz', last: 'gamma' },
  ];

  setup('reset taskclusterCheckRuns table', async function() {
    await helper.withDbClient(async client => {
      await client.query(`delete from taskcluster_check_runs_entities`);
      await client.query(`insert into taskcluster_check_runs_entities (partition_key, row_key, value, version) values ('foo', 'bar', '{ "first": "foo", "last": "bar" }', 1), ('bar', 'foo', '{ "first": "bar", "last": "foo" }', 1)`);
    });
    await helper.fakeDb.github.reset();
    await helper.fakeDb.github.taskcluster_check_runs_entities_create('foo', 'bar', taskclusterCheckRuns[0], false, 1);
    await helper.fakeDb.github.taskcluster_check_runs_entities_create('bar', 'foo', taskclusterCheckRuns[1], false, 1);
  });

  helper.dbTest('taskcluster_check_runs_entities_load', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_check_runs_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.deepEqual(taskclusterCheckRuns[0], fooClient.value);
  });

  helper.dbTest('taskcluster_check_runs_entities_create', async function(db, isFake) {
    const [{ taskcluster_check_runs_entities_create: etag }] = await db.fns.taskcluster_check_runs_entities_create('baz', 'gamma', taskclusterCheckRuns[2], false, 1);
    assert(typeof etag === 'string');
    const [bazClient] = await db.fns.taskcluster_check_runs_entities_load('baz', 'gamma');
    assert.equal(bazClient.etag, etag);
    assert.equal(bazClient.partition_key_out, 'baz');
    assert.equal(bazClient.row_key_out, 'gamma');
    assert.equal(bazClient.version, 1);
    assert.deepEqual(taskclusterCheckRuns[2], bazClient.value);
  });

  helper.dbTest('taskcluster_check_runs_entities_create throws when overwrite is false', async function(db, isFake) {
    await db.fns.taskcluster_check_runs_entities_create('baz', 'gamma', taskclusterCheckRuns[2], false, 1);
    await assert.rejects(
      () => db.fns.taskcluster_check_runs_entities_create('baz', 'gamma', taskclusterCheckRuns[2], false, 1),
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('taskcluster_check_runs_entities_create does not throw when overwrite is true', async function(db, isFake) {
    await db.fns.taskcluster_check_runs_entities_create('baz', 'gamma', taskclusterCheckRuns[2], true, 1);
    await db.fns.taskcluster_check_runs_entities_create('baz', 'gamma', { ...taskclusterCheckRuns[2], last: 'updated' }, true, 1);

    const [bazClient] = await db.fns.taskcluster_check_runs_entities_load('baz', 'gamma');
    assert.deepEqual({ ...taskclusterCheckRuns[2], last: 'updated' }, bazClient.value);
  });

  helper.dbTest('taskcluster_check_runs_entities_remove', async function(db, isFake) {
    const [fooClient] = await db.fns.taskcluster_check_runs_entities_remove('foo', 'bar');
    const c = await db.fns.taskcluster_check_runs_entities_load('foo', 'bar');
    assert(typeof fooClient.etag === 'string');
    assert.equal(c.length, 0);
  });

  helper.dbTest('taskcluster_check_runs_entities_modify', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_check_runs_entities_load('foo', 'bar');
    const [etag] = await db.fns.taskcluster_check_runs_entities_modify('foo', 'bar', value, 1, oldEtag);
    const [fooClient] = await db.fns.taskcluster_check_runs_entities_load('foo', 'bar');
    assert(fooClient.etag !== etag);
    assert.equal(fooClient.partition_key_out, 'foo');
    assert.equal(fooClient.row_key_out, 'bar');
    assert.equal(fooClient.version, 1);
    assert.equal(fooClient.value.first, 'updated');
    assert.equal(fooClient.value.last, 'updated');
  });

  helper.dbTest('taskcluster_check_runs_entities_modify throws when no such row', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_check_runs_entities_load('foo', 'bar');
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_check_runs_entities_modify('foo', 'does-not-exist', value, 1, oldEtag);
      },
      err => err.code === 'P0002',
    );
  });

  helper.dbTest('taskcluster_check_runs_entities_modify throws when update was unsuccessful (e.g., etag value did not match)', async function(db, isFake) {
    const value = { first: 'updated', last: 'updated' };
    const [{ etag: oldEtag }] = await db.fns.taskcluster_check_runs_entities_load('foo', 'bar');
    await db.fns.taskcluster_check_runs_entities_modify('foo', 'bar', value, 1, oldEtag);
    await assert.rejects(
      async () => {
        await db.fns.taskcluster_check_runs_entities_modify('foo', 'bar', value, 1, oldEtag);
      },
      err => err.code === 'P0004',
    );
  });

  // TODO : Add test for taskcluster_check_runs_entities_scan
});
