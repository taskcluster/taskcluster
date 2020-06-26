const _ = require('lodash');
const { fromNow } = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');
const slug = require('slugid');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/queue/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const ArtifactEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.CompositeKey('taskId', 'runId'),
  rowKey: Entity.keys.StringKey('name'),
  properties: {
    taskId: Entity.types.SlugId,
    runId: Entity.types.Number,
    name: Entity.types.String,
    storageType: Entity.types.String,
    contentType: Entity.types.String,
    details: Entity.types.JSON,
    expires: Entity.types.Date,
    present: Entity.types.Boolean,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('queue_artifacts table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_artifacts_entities');
    await helper.assertNoTable('queue_artifacts');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('queue_artifacts_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('queue_artifacts');
  });

  const taskIds = [
    'XypynWgSRGqxsZLy2Pbbng',
    'Pjnlqi31Q0qHWNFASWmVEQ',
    'OHehWFRIQ3mOP8tQOvz19w',
    'Y5_8FoDYThyJYFUVyyi0lQ',
    'eZvzf0qgSOWZp9uqwfp6aw',
  ];

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'queue',
    entityTableName: 'queue_artifacts_entities',
    newTableName: 'queue_artifacts',
    EntityClass: ArtifactEntity,
    samples: {
      pptt: {
        taskId: 'J6CQMUHpTyGrWDgfp17J8g',
        runId: 5,
        name: 'name/name',
        storageType: 'storage-type',
        contentType: 'content-type',
        details: {
          value: 0,
          slashy: "\\\\",
        },
        present: true,
        expires: fromNow('1 day'),
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          taskId: taskIds[i],
          runId: i,
          name: `name-${i}`,
          storageType: `storage-type-${i}`,
          contentType: `content-type-${i}`,
          details: {
            value: i,
          },
          present: false,
          expires: fromNow('1 day'),
        }]))),
    },
    loadConditions: [
      {condition: {taskId: 'J6CQMUHpTyGrWDgfp17J8g', runId: 5, name: 'name/name' }, expectedSample: 'pptt'},
      {condition: {taskId: taskIds[1], runId: 1, name: 'name-1' }, expectedSample: 'samp1'},
    ],
    scanConditions: [
      // expected is ordered by the hashed namespace
      {condition: {}, expectedSamples: ['samp4', 'pptt', 'samp2', 'samp1', 'samp0', 'samp3']},
      {condition: null, expectedSamples: ['samp4', 'pptt', 'samp2', 'samp1', 'samp0', 'samp3']},
    ],
    notFoundConditions: [
      {condition: {taskId: slug.nice(), name: 'no/such', runId: 0}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {taskId: 'J6CQMUHpTyGrWDgfp17J8g', name: 'name/name', runId: 5},
      modifier: [
        ent => {
          ent.present = false;
        },
        ent => {
          ent.expires = new Date(2);
        },
      ],
      checker(ent) {
        assert.equal(ent.present, false);
        assert.equal(ent.expires.toJSON(), new Date(2).toJSON());
      },
    }],
  });
});
