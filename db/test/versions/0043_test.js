const assert = require('assert').strict;
const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const Entity = require('taskcluster-lib-entities');
const { fromNow } = require('taskcluster-client/src/utils');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/queue/src/data.js)
const QueueWorkerEntities = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.CompositeKey('provisionerId', 'workerType'),
  rowKey: Entity.keys.CompositeKey('workerGroup', 'workerId'),
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,
    /**
     * List of objects with properties:
     * - taskId
     * - runId
     * See JSON schema for documentation.
     */
    recentTasks: Entity.types.JSON,
    quarantineUntil: Entity.types.Date,
    // the time at which this worker should no longer be displayed
    expires: Entity.types.Date,
    firstClaim: Entity.types.Date,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('queue_workers table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_worker_entities');
    await helper.assertNoTable('queue_workers');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('queue_workers');
    await helper.assertNoTable('queue_worker_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('queue_worker_entities');
    await helper.assertNoTable('queue_workers');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'queue',
    entityTableName: 'queue_worker_entities',
    newTableName: 'queue_workers',
    EntityClass: QueueWorkerEntities,
    samples: {
      aabbccddeeff: {
        provisionerId: 'aaa/provisioner',
        workerType: 'aaa/workertype',
        workerGroup: 'aaa/workergroup',
        workerId: 'aaa/workerid',
        recentTasks: [{
          'taskId': 'aaa/taskid',
        }],
        quarantineUntil: new Date(0),
        expires: fromNow('1 day'),
        firstClaim: new Date(2),
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          provisionerId: `some/provisioner${i}`,
          workerType: `some/workertype${i}`,
          workerGroup: `some/workergroup${i}`,
          workerId: `some/workerid${i}`,
          recentTasks: [{
            taskId: `some/taskid${i}`,
          }],
          quarantineUntil: new Date(0),
          expires: new Date(1),
          firstClaim: new Date(2),
        }]))),
    },
    loadConditions: [
      {condition: {provisionerId: 'aaa/provisioner', workerType: 'aaa/workertype', workerGroup: 'aaa/workergroup', workerId: 'aaa/workerid'}, expectedSample: 'aabbccddeeff'},
      {condition: {provisionerId: 'some/provisioner1', workerType: 'some/workertype1', workerGroup: 'some/workergroup1', workerId: 'some/workerid1'}, expectedSample: 'samp1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['aabbccddeeff', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
      {condition: null, expectedSamples: ['aabbccddeeff', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
      {condition: {provisionerId: 'aaa/provisioner', workerType: 'aaa/workertype', workerGroup: 'aaa/workergroup'}, expectedSamples: ['aabbccddeeff']},
      {condition: {provisionerId: 'some/provisioner0', workerType: 'some/workertype0'}, expectedSamples: ['samp0']},
    ],
    notFoundConditions: [
      {condition: {provisionerId: 'no/such', workerType: 'no/such', workerGroup: 'no/such', workerId: 'no/such'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {provisionerId: 'aaa/provisioner', workerType: 'aaa/workertype', workerGroup: 'aaa/workergroup', workerId: 'aaa/workerid'},
      modifier: [
        ent => {
          ent.expires = new Date(3);
          ent.recentTasks = [{'taskId': 'bbb/taskid'}];
        },
      ],
      checker(ent) {
        assert.deepEqual(ent.expires, new Date(3));
        assert.deepEqual(ent.recentTasks, [{'taskId': 'bbb/taskid'}]);
      },
    }],
  });
});
