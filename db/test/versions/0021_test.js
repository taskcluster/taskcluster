const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert');
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/queue/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
let TaskGroup = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskGroupId'),
  rowKey: Entity.keys.ConstantKey('task-group'),
  properties: {
    taskGroupId: Entity.types.SlugId,
    schedulerId: Entity.types.String,
    expires: Entity.types.Date,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('tables created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_task_groups_entities');
    await helper.assertNoTable('task_groups');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('queue_task_groups_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('queue_task_groups_entities');
    await helper.assertNoTable('task_groups');
  });

  const future = taskcluster.fromNow('1 day');

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'queue',
    entityTableName: 'queue_task_groups_entities',
    newTableName: 'task_groups',
    EntityClass: TaskGroup,
    samples: {
      unexpired: {
        taskGroupId: 'U1DhJjLaRDeP9ml-HMClKQ',
        schedulerId: 'unexp',
        expires: taskcluster.fromNow('1 day'),
      },
      unexpired2: {
        taskGroupId: 'NRAMa0jHTC2VlKXoKstocQ',
        schedulerId: 'unexp',
        expires: taskcluster.fromNow('1 day'),
      },
      expired: {
        taskGroupId: 't2QC2Q3nRf68CCU80124bg',
        schedulerId: 'exp',
        expires: taskcluster.fromNow('-1 day'),
      },
      expired2: {
        taskGroupId: '96n1rZXAQb2Keg2Dgody8w',
        schedulerId: 'exp',
        expires: taskcluster.fromNow('-1 day'),
      },
    },
    loadConditions: [
      {condition: {taskGroupId: 'U1DhJjLaRDeP9ml-HMClKQ'}, expectedSample: 'unexpired'},
    ],
    scanConditions: [
      {condition: {expires: Entity.op.lessThan(new Date())}, expectedSamples: ['expired2', 'expired']},
    ],
    notFoundConditions: [
      {condition: {taskGroupId: 'hqsd4Ij1QH2a8ps4ijpY8A'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {taskGroupId: 't2QC2Q3nRf68CCU80124bg'},
      modifier: [
        ent => {
          ent.expires = future;
        },
      ],
      checker(ent) {
        assert.deepEqual(ent.expires, future);
      },
    }],
  });
});
