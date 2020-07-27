const _ = require('lodash');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const {fromNow} = require('taskcluster-client');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/secrets/src/data.js)
const Secret = Entity.configure({
  version: 1,
  signEntities: false,
  partitionKey: Entity.keys.ConstantKey('secrets'),
  rowKey: Entity.keys.StringKey('name'),
  properties: {
    name: Entity.types.String,
    secret: Entity.types.EncryptedJSON,
    expires: Entity.types.Date,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('secrets table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('secrets_entities');
    await helper.assertNoTable('secrets');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('secrets_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('secrets');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'secrets',
    entityTableName: 'secrets_entities',
    newTableName: 'secrets',
    EntityClass: Secret,
    cryptoKey: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo=',
    samples: {
      ...Object.fromEntries(_.range(10).map(i => ([
        `simple${i}`, {
          name: `secret/${i}`,
          secret: {something: i},
          expires: fromNow(`${i} weeks`),
        }]))),
    },
    loadConditions: [
      {condition: {name: 'secret/1'}, expectedSample: 'simple1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: _.range(10).map(i => `simple${i}`)},
    ],
    notFoundConditions: [
      {condition: {name: 'notathing'}},
    ],
    notImplemented: ['modifications'],
    modifications: [{
      condition: {name: 'secret/4'},
      modifier: [
        ent => {
          ent.secret = {somethingNew: 'abc'};
        },
      ],
      checker(ent) {
        assert.equal(ent.secret.somethingNew, 'abc');
      },
    }],
  });
});
