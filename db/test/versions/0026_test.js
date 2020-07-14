const assert = require('assert').strict;
const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/hooks/src/data.js)
const QueuesEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('hookGroupId'),
  rowKey: Entity.keys.StringKey('hookId'),
  properties: {
    hookGroupId: Entity.types.String,
    hookId: Entity.types.String,
    queueName: Entity.types.String,
    bindings: Entity.types.JSON,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('hooks_queues table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queues_entities');
    await helper.assertNoTable('hooks_queues');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('hooks_queues');
    await helper.assertNoTable('queues_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('queues_entities');
    await helper.assertNoTable('hooks_queues');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'hooks',
    entityTableName: 'queues_entities',
    newTableName: 'hooks_queues',
    EntityClass: QueuesEntity,
    samples: {
      aabbccddeeff: {
        hookGroupId: 'aa/bb',
        hookId: 'cc/dd',
        queueName: 'queue-name',
        bindings: [{
          exchange: '',
          routingKeyPattern: '',
        }],
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          hookGroupId: `samp/${i}`,
          hookId: `hi-samp/${i}`,
          queueName: 'qn',
          bindings: [{}],
        }]))),
    },
    loadConditions: [
      {condition: {hookGroupId: 'aa/bb', hookId: 'cc/dd'}, expectedSample: 'aabbccddeeff'},
      {condition: {hookGroupId: 'samp/1', hookId: 'hi-samp/1'}, expectedSample: 'samp1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['aabbccddeeff', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
      {condition: null, expectedSamples: ['aabbccddeeff', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
    ],
    notFoundConditions: [
      {condition: {hookGroupId: 'no/such', hookId: 'no/such'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {hookGroupId: 'aa/bb', hookId: 'cc/dd'},
      modifier: [
        ent => {
          ent.queueName = 'updated';
        },
      ],
      checker(ent) {
        assert.equal(ent.queueName, 'updated');
      },
    }],
  });
});
