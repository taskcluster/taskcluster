const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const slugid = require('slugid');
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/github/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const CheckRuns = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskGroupId'),
  rowKey: Entity.keys.StringKey('taskId'),
  properties: {
    taskGroupId: Entity.types.String,
    taskId: Entity.types.String,
    checkSuiteId: Entity.types.String,
    checkRunId: Entity.types.String,
  },
});
const ChecksToTasks = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('checkSuiteId'),
  rowKey: Entity.keys.StringKey('checkRunId'),
  properties: {
    taskGroupId: Entity.types.String,
    taskId: Entity.types.String,
    checkSuiteId: Entity.types.String,
    checkRunId: Entity.types.String,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('builds table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('taskcluster_checks_to_tasks_entities');
    await helper.assertTable('taskcluster_check_runs_entities');
    await helper.assertNoTable('github_checks');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('taskcluster_checks_to_tasks_entities');
    await helper.assertNoTable('taskcluster_check_runs_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('github_checks');
    await helper.assertTable('taskcluster_checks_to_tasks_entities');
    await helper.assertTable('taskcluster_check_runs_entities');
  });

  const taskGroupId = slugid.v4();
  const taskId = slugid.v4();

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'github',
    entityTableName: 'taskcluster_check_runs_entities',
    newTableName: 'github_checks',
    EntityClass: CheckRuns,
    samples: {
      simple1: {
        taskGroupId,
        taskId,
        checkSuiteId: 'abc',
        checkRunId: 'def',
      },
      simple2: {
        taskGroupId: slugid.v4(),
        taskId: slugid.v4(),
        checkSuiteId: 'ghi',
        checkRunId: 'jkl',
      },
    },
    loadConditions: [
      {condition: {taskGroupId, taskId}, expectedSample: 'simple1'},
    ],
    notFoundConditions: [
      {condition: {taskGroupId: 'doesntexist', taskId}},
      {condition: {taskGroupId, taskId: 'doesntexist'}},
    ],
    notImplemented: ['remove-ignore-if-not-exists', 'modifications', 'create-overwrite', 'scanning'],
  });
  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'github',
    entityTableName: 'taskcluster_checks_to_tasks_entities',
    newTableName: 'github_checks',
    EntityClass: ChecksToTasks,
    samples: {
      simple1: {
        taskGroupId,
        taskId,
        checkSuiteId: 'abc',
        checkRunId: 'def',
      },
      simple2: {
        taskGroupId: slugid.v4(),
        taskId: slugid.v4(),
        checkSuiteId: 'ghi',
        checkRunId: 'jkl',
      },
    },
    loadConditions: [
      {condition: {checkSuiteId: 'abc', checkRunId: 'def'}, expectedSample: 'simple1'},
    ],
    notFoundConditions: [
      {condition: {checkSuiteId: 'doesntexist', checkRunId: 'def'}},
    ],
    notImplemented: ['remove-ignore-if-not-exists', 'modifications', 'create-overwrite', 'scanning'],
  });
});
