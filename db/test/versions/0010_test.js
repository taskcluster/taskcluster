const _ = require('lodash');
const {range} = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

// (adapted from services/worker-manager/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const WorkerPoolEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('workerPoolId'),
  rowKey: Entity.keys.ConstantKey('workerPool'),
  properties: {
    workerPoolId: Entity.types.String,
    providerId: Entity.types.String,
    previousProviderIds: Entity.types.JSON,
    description: Entity.types.String,
    created: Entity.types.Date,
    lastModified: Entity.types.Date,
    config: Entity.types.JSON,
    owner: Entity.types.String,
    emailOnError: Entity.types.Boolean,
    providerData: Entity.types.JSON,
  },
  context: [],
});

suite(testing.suiteName(), function() {
  const THIS_VERSION = 10;
  const PREV_VERSION = THIS_VERSION - 1;
  helper.withDbForVersion();

  test('tables created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('wmworker_pools_entities');
    await helper.assertNoTable('worker_pools');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('wmworker_pools_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('worker_pools');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'worker_manager',
    entityTableName: 'wmworker_pools_entities',
    newTableName: 'worker_pools',
    EntityClass: WorkerPoolEntity,
    samples: {
      pptt: {
        workerPoolId: 'pp/tt',
        providerId: 'static',
        owner: 'someone@example.com',
        description: 'test worker pool \o/', // <-- backslash
        emailOnError: false,
        created: new Date('2015-12-17T03:24:00'),
        lastModified: new Date('2016-12-17T03:24:00'),
        config: {
          bigData: [range(1000).map(i => `Value ${i}`)],
          slashy: "\\\\",
        },
        providerData: {
          static: 'testdata',
        },
        previousProviderIds: ['dynamic'],
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          workerPoolId: `samp/${i}`,
          providerId: 'null-provider',
          owner: 'someone@example.com',
          description: `sample ${i}`,
          emailOnError: true,
          created: new Date(),
          lastModified: new Date(),
          config: {},
          providerData: {},
          previousProviderIds: [], // an empty array can cause issues..
        }]))),
    },
    loadConditions: [
      {condition: {workerPoolId: 'pp/tt'}, expectedSample: 'pptt'},
      {condition: {workerPoolId: 'samp/1'}, expectedSample: 'samp1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['pptt', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
      {condition: null, expectedSamples: ['pptt', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
    ],
    notFoundConditions: [
      {condition: {workerPoolId: 'no/such'}},
    ],
    notImplemented: ['create-overwrite', 'remove-ignore-if-not-exists'],
    modifications: [{
      condition: {workerPoolId: 'pp/tt'},
      modifier: [
        ent => {
          ent.providerId = 'updated';
        },
        ent => {
          ent.previousProviderIds = [];
        },
      ],
      checker(ent) {
        assert.equal(ent.providerId, 'updated');
        assert.deepEqual(ent.previousProviderIds, []);
      },
    }],
  });
});
