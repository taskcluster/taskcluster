const _ = require('lodash');
const helper = require('../helper');
const { fromNow } = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/purge-cache/src/data.js)
const CachePurgeEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.CompositeKey('provisionerId', 'workerType'),
  rowKey: Entity.keys.StringKey('cacheName'),
  properties: {
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    cacheName: Entity.types.String,
    before: Entity.types.Date,
    expires: Entity.types.Date,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('cache_purges table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('cache_purges_entities');
    await helper.assertNoTable('cache_purges');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('cache_purges_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('cache_purges');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'purge_cache',
    entityTableName: 'cache_purges_entities',
    newTableName: 'cache_purges',
    EntityClass: CachePurgeEntity,
    samples: {
      pptt: {
        provisionerId: 'foo/foo',
        workerType: 'bar/bar',
        cacheName: 'gamma/gamma',
        before: new Date(0),
        expires: fromNow('1 day'),
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          provisionerId: `provisioner-id-${i}`,
          workerType: `worker-type-${i}`,
          cacheName: `cache-name-${i}`,
          before: new Date(0),
          expires: fromNow('1 day'),
        }]))),
    },
    loadConditions: [
      {condition: {provisionerId: 'foo/foo', workerType: 'bar/bar', cacheName: 'gamma/gamma' }, expectedSample: 'pptt'},
      {condition: {provisionerId: 'provisioner-id-1', workerType: 'worker-type-1', cacheName: 'cache-name-1'}, expectedSample: 'samp1'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['pptt', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
      {condition: null, expectedSamples: ['pptt', 'samp0', 'samp1', 'samp2', 'samp3', 'samp4']},
    ],
    notFoundConditions: [
      {condition: {provisionerId: 'no/such', workerType: 'no/such', cacheName: 'no/such'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {provisionerId: 'foo/foo', workerType: 'bar/bar', cacheName: 'gamma/gamma'},
      modifier: [
        ent => {
          ent.before = new Date(1);
        },
        ent => {
          ent.expires = new Date(2);
        },
      ],
      checker(ent) {
        assert.equal(ent.before.toJSON(), new Date(1).toJSON());
        assert.equal(ent.expires.toJSON(), new Date(2).toJSON());
      },
    }],
  });
});
