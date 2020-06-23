const _ = require('lodash');
const {range} = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/worker-manager/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const WorkerEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('workerPoolId'),
  rowKey: Entity.keys.CompositeKey('workerGroup', 'workerId'),
  properties: {
    workerPoolId: Entity.types.String,
    workerGroup: Entity.types.String,
    workerId: Entity.types.String,
    providerId: Entity.types.String,
    created: Entity.types.Date,
    expires: Entity.types.Date,
    state: Entity.types.String,
    providerData: Entity.types.JSON,
    capacity: Entity.types.Number,
    lastModified: Entity.types.Date,
    lastChecked: Entity.types.Date,
  },
  context: [],
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('workers table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('wmworkers_entities');
    await helper.assertNoTable('workers');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('wmworkers_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('workers');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'worker_manager',
    entityTableName: 'wmworkers_entities',
    newTableName: 'workers',
    EntityClass: WorkerEntity,
    samples: {
      aabbccddeeff: {
        workerPoolId: 'aa/bb',
        workerGroup: 'cc/dd',
        workerId: 'ee/ff',
        providerId: 'static',
        created: new Date('2015-12-17T03:24:00'),
        expires: new Date('3020-12-17T03:24:00'),
        state: 'requested',
        providerData: {
          static: 'testdata',
          slashy: "\\\\",
          bigData: [range(1000).map(i => `Value ${i}`)],
        },
        capacity: 2,
        lastModified: new Date('2016-12-17T03:24:00'),
        lastChecked: new Date('2017-12-17T03:24:00'),
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          workerPoolId: `samp/${i}`,
          workerGroup: `wg-samp/${i}`,
          workerId: `wi-samp/${i}`,
          providerId: 'null-provider',
          created: new Date(),
          expires: new Date(),
          state: 'requested',
          providerData: {},
          capacity: 1,
          lastModified: new Date(),
          lastChecked: new Date(),
        }]))),
    },
    loadConditions: [
      {condition: {workerPoolId: 'aa/bb', workerGroup: 'cc/dd', workerId: 'ee/ff'}, expectedSample: 'aabbccddeeff'},
      {condition: {workerPoolId: 'samp/1', workerGroup: 'wg-samp/1', workerId: 'wi-samp/1'}, expectedSample: 'samp1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['aabbccddeeff', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
      {condition: null, expectedSamples: ['aabbccddeeff', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
    ],
    notFoundConditions: [
      {condition: {workerPoolId: 'no/such', workerGroup: 'no/such', workerId: 'no/such'}},
    ],
    notImplemented: ['create-overwrite', 'remove-ignore-if-not-exists'],
    modifications: [{
      condition: {workerPoolId: 'aa/bb', workerGroup: 'cc/dd', workerId: 'ee/ff'},
      modifier: [
        ent => {
          ent.providerId = 'updated';
        },
        ent => {
          ent.capacity = 4;
        },
      ],
      checker(ent) {
        assert.equal(ent.providerId, 'updated');
        assert.deepEqual(ent.capacity, 4);
      },
    }],
  });
});
