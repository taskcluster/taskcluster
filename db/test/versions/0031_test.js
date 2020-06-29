const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/purge-cache/src/data.js)
const WorkerPoolErrorEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('errorId'),
  rowKey: Entity.keys.StringKey('errorId'),
  properties: {
    errorId: Entity.types.String,
    workerPoolId: Entity.types.String,
    reported: Entity.types.Date,
    kind: Entity.types.String,
    title: Entity.types.String,
    description: Entity.types.String,
    extra: Entity.types.JSON,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('worker_pool_errors table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('wmworker_pool_errors_entities');
    await helper.assertNoTable('worker_pool_errors');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('wmworker_pool_errors_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('worker_pool_errors');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'worker_manager',
    entityTableName: 'wmworker_pool_errors_entities',
    newTableName: 'worker_pool_errors',
    EntityClass: WorkerPoolErrorEntity,
    samples: {
      exampleerror: {
        errorId: 'error123',
        workerPoolId: 'foo/bar',
        reported: new Date(0),
        kind: 'an error',
        title: 'error foo 123',
        description: 'foo error!',
        extra: {},
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          errorId: `error-id-${i}`,
          workerPoolId: `foo/${i}`,
          reported: new Date(0),
          kind: 'an error',
          title: `error foo ${i}`,
          description: 'foo error!',
          extra: {},
        }]))),
    },
    loadConditions: [
      {condition: {errorId: 'error123', workerPoolId: 'foo/bar', title: 'error foo 123'}, expectedSample: 'exampleerror'},
      {condition: {errorId: 'error-id-1', workerPoolId: 'foo/1', kind: 'an error'}, expectedSample: 'samp1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['exampleerror', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
      {condition: null, expectedSamples: ['exampleerror', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
    ],
    notFoundConditions: [
      {condition: {errorId: 'no/such', workerPoolId: 'no/such', title: 'no/such'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {errorId: 'error123', workerPoolId: 'foo/bar', title: 'error foo 123', kind: 'an error', description: 'foo error!'},
      modifier: [
        ent => {
          ent.reported = new Date(1);
        },
      ],
      checker(ent) {
        assert.equal(ent.reported.toJSON(), new Date(1).toJSON());
      },
    }],
  });
});
