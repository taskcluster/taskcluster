const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = 15;
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/github/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const Builds = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskGroupId'),
  rowKey: Entity.keys.ConstantKey('taskGroupId'),
  properties: {
    organization: Entity.types.String,
    repository: Entity.types.String,
    sha: Entity.types.String,
    taskGroupId: Entity.types.String,
    state: Entity.types.String,
    created: Entity.types.Date,
    updated: Entity.types.Date,
    installationId: Entity.types.Number,
    eventType: Entity.types.String,
    eventId: Entity.types.String,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('builds table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('taskcluster_github_builds_entities');
    await helper.assertNoTable('github_builds');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('taskcluster_github_builds_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('github_builds');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'github',
    entityTableName: 'taskcluster_github_builds_entities',
    newTableName: 'github_builds',
    EntityClass: Builds,
    samples: {
      simple1: {
        organization: 'foo',
        repository: 'bar',
        sha: 'fafccc9f15d27c1cfef16aba457d33ccde27218a',
        taskGroupId: 'EpvHX_OSSj2WSBs1SLhFYA',
        state: 'success',
        created: taskcluster.fromNow('-1 hour'),
        updated: taskcluster.fromNow(),
        installationId: 1234,
        eventType: 'pull_request.opened',
        eventId: '3fe8a100-84a2-11ea-9c81-5761ce89a3cf',
      },
      simple2: {
        organization: 'foo',
        repository: 'bar',
        sha: 'otherc9f15d27c1cfef16aba457d33ccde27218a',
        taskGroupId: 'other_OSSj2WSBs1SLhFYA',
        state: 'failure',
        created: taskcluster.fromNow('-2 hour'),
        updated: taskcluster.fromNow('-1 hour'),
        installationId: 1234,
        eventType: 'pull_request.opened',
        eventId: 'other100-84a2-11ea-9c81-5761ce89a3cf',
      },
    },
    loadConditions: [
      {condition: {taskGroupId: 'EpvHX_OSSj2WSBs1SLhFYA'}, expectedSample: 'simple1'},
      {condition: {taskGroupId: 'other_OSSj2WSBs1SLhFYA'}, expectedSample: 'simple2'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['simple1', 'simple2']},
      {condition: null, expectedSamples: ['simple1', 'simple2']},
    ],
    notFoundConditions: [
      {condition: {taskGroupId: 'doesntexist'}},
    ],
    notImplemented: ['create-overwrite', 'remove-ignore-if-not-exists'],
    modifications: [{
      condition: {taskGroupId: 'other_OSSj2WSBs1SLhFYA'},
      modifier: [
        ent => {
          ent.state = 'success';
        },
      ],
      checker(ent) {
        assert.equal(ent.state, 'success');
      },
    }],
  });
});
