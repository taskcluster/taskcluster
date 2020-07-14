const _ = require('lodash');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');
const helper = require('../helper');
const slugid = require('slugid');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/purge-cache/src/data.js)
const WorkerPoolErrorEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('workerPoolId'),
  rowKey: Entity.keys.StringKey('errorId'),
  properties: {
    errorId: Entity.types.SlugId,
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

  const test_ids = [
    'DmOXbNfzR7KMVF-T7nP5gQ',
    'EhBK0ePORKmmtgWTPJP1LA',
    'Li6CUdf3SUihrYsKuyUUkA',
    'NArCGRV_RGu-pJzSo6p8Dg',
    'RbRIycE8S-GbEPMH8uDoaQ',
  ];

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'worker_manager',
    entityTableName: 'wmworker_pool_errors_entities',
    newTableName: 'worker_pool_errors',
    EntityClass: WorkerPoolErrorEntity,
    samples: {
      exampleerror: {
        errorId: 'V4s8CGz3RtGZam6FQ7u9Yw',
        workerPoolId: 'foo/bar',
        reported: new Date(0),
        kind: 'an error',
        title: 'error foo 5',
        description: 'foo error!',
        extra: {},
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          errorId: test_ids[i],
          workerPoolId: `foo/${i}`,
          reported: new Date(0),
          kind: 'an error',
          title: `error foo ${i}`,
          description: 'foo error!',
          extra: {},
        }]))),
    },
    loadConditions: [
      {condition: {errorId: 'V4s8CGz3RtGZam6FQ7u9Yw', workerPoolId: 'foo/bar', title: 'error foo 5'}, expectedSample: 'exampleerror'},
      {condition: {errorId: slugid.encode('12104ad1-e3ce-44a9-a6b6-05933c93f52c'), workerPoolId: 'foo/1', kind: 'an error'}, expectedSample: 'samp1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['samp0', 'samp1', 'samp2', 'samp3', 'samp4', 'exampleerror']},
      {condition: null, expectedSamples: ['samp0', 'samp1', 'samp2', 'samp3', 'samp4', 'exampleerror']},
    ],
    notFoundConditions: [
      {condition: {errorId: 'QB5QiL0jSsuNZ5fDrpwvKg', workerPoolId: 'no/such', title: 'no/such'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {errorId: 'V4s8CGz3RtGZam6FQ7u9Yw', workerPoolId: 'foo/bar'},
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
