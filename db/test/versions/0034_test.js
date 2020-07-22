const assert = require('assert').strict;
const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/hooks/src/data.js)
const HooksEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('hookGroupId'),
  rowKey: Entity.keys.StringKey('hookId'),
  properties: {
    hookGroupId: Entity.types.String,
    hookId: Entity.types.String,
    metadata: Entity.types.JSON,
    // task template
    task: Entity.types.JSON,
    // pulse bindings
    bindings: Entity.types.JSON,
    // schedule for this task (see schemas/schedule.yml)
    schedule: Entity.types.JSON,
    // access token used to trigger this task via webhook
    triggerToken: Entity.types.EncryptedText,
    // the taskId that will be used next time this hook is scheduled;
    // this allows scheduling to be idempotent
    nextTaskId: Entity.types.EncryptedText,
    // next date at which this task is scheduled to run
    nextScheduledDate: Entity.types.Date,
    //triggerSchema define types allowed in a context
    triggerSchema: Entity.types.JSON,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('hooks table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('hooks_entities');
    await helper.assertNoTable('hooks');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('hooks');
    await helper.assertNoTable('hooks_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('hooks_entities');
    await helper.assertNoTable('hooks');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'hooks',
    entityTableName: 'hooks_entities',
    newTableName: 'hooks',
    EntityClass: HooksEntity,
    cryptoKey: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
    samples: {
      aabbccddeeff: {
        hookGroupId: 'aa/bb',
        hookId: 'cc/dd',
        metadata: {},
        task: {},
        bindings: [{
          exchange: '',
          routingKeyPattern: '',
        }],
        schedule: {},
        triggerToken: 'trigger-token',
        nextTaskId: 'next-task-id',
        nextScheduledDate: new Date(),
        triggerSchema: {},
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          hookGroupId: `samp/${i}`,
          hookId: `hi-samp/${i}`,
          metadata: {},
          task: {},
          bindings: [{}],
          schedule: {},
          triggerToken: `trigger-token-${i}`,
          nextTaskId: `next-task-id-${i}`,
          nextScheduledDate: new Date(),
          triggerSchema: {},
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
          ent.nextScheduledDate = new Date(1);
        },
      ],
      checker(ent) {
        assert.deepEqual(ent.nextScheduledDate, new Date(1));
      },
    }],
  });
});
