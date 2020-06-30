const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/github/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const OwnersDirectory = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('owner'),
  rowKey: Entity.keys.ConstantKey('someConstant'),
  properties: {
    installationId: Entity.types.Number,
    owner: Entity.types.String,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('builds table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('taskcluster_integration_owners_entities');
    await helper.assertNoTable('github_integrations');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('taskcluster_integration_owners_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('github_integrations');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'github',
    entityTableName: 'taskcluster_integration_owners_entities',
    newTableName: 'github_integrations',
    EntityClass: OwnersDirectory,
    samples: {
      simple1: {
        owner: 'foo',
        installationId: 1234,
      },
      simple2: {
        owner: 'bar',
        installationId: 1235,
      },
    },
    loadConditions: [
      {condition: {owner: 'foo'}, expectedSample: 'simple1'},
      {condition: {owner: 'bar'}, expectedSample: 'simple2'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['simple2', 'simple1']},
      {condition: null, expectedSamples: ['simple2', 'simple1']},
    ],
    notFoundConditions: [
      {condition: {owner: 'doesntexist'}},
    ],
    notImplemented: ['remove-ignore-if-not-exists', 'modifications'],
  });
});
