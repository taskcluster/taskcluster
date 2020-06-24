const _ = require('lodash');
const { fromNow } = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');
const slug = require('slugid');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/index/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const IndexedTaskEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.HashKey('namespace'),
  rowKey: Entity.keys.StringKey('name'),
  properties: {
    namespace: Entity.types.String,
    name: Entity.types.String,
    rank: Entity.types.Number,
    taskId: Entity.types.SlugId,
    data: Entity.types.JSON,
    expires: Entity.types.Date,
  },
});

/** Entities for namespaces */
const NamespaceEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.HashKey('parent'),
  rowKey: Entity.keys.StringKey('name'),
  properties: {
    parent: Entity.types.String,
    name: Entity.types.String,
    expires: Entity.types.Date,
  },
});

suite(`${testing.suiteName()} - indexed_tasks`, function() {
  helper.withDbForVersion();

  test('indexed_tasks table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('indexed_tasks_entities');
    await helper.assertNoTable('indexed_tasks');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('indexed_tasks_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('indexed_tasks');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'index',
    entityTableName: 'indexed_tasks_entities',
    newTableName: 'indexed_tasks',
    EntityClass: IndexedTaskEntity,
    samples: {
      pptt: {
        namespace: 'foo/foo',
        name: 'bar/bar',
        rank: 5,
        taskId: slug.nice(),
        data: {
          value: 0,
          slashy: "\\\\",
        },
        expires: fromNow('1 day'),
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          namespace: `namespace-${i}`,
          name: `name-${i}`,
          rank: i,
          taskId: slug.nice(),
          data: {
            value: i,
          },
          expires: fromNow('1 day'),
        }]))),
    },
    loadConditions: [
      {condition: {namespace: 'foo/foo', name: 'bar/bar' }, expectedSample: 'pptt'},
      {condition: {namespace: 'namespace-1', name: 'name-1' }, expectedSample: 'samp1'},
    ],
    scanConditions: [
      // expected is ordered by the hashed namespace
      {condition: {}, expectedSamples: ['pptt', 'samp0', 'samp4', 'samp2', 'samp3', 'samp1']},
      {condition: null, expectedSamples: ['pptt', 'samp0', 'samp4', 'samp2', 'samp3', 'samp1']},
    ],
    notFoundConditions: [
      {condition: {namespace: 'no/such', name: 'no/such'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {namespace: 'foo/foo', name: 'bar/bar'},
      modifier: [
        ent => {
          ent.rank = 10;
        },
        ent => {
          ent.expires = new Date(2);
        },
      ],
      checker(ent) {
        assert.equal(ent.rank, 10);
        assert.equal(ent.expires.toJSON(), new Date(2).toJSON());
      },
    }],
  });
});

suite(`${testing.suiteName()} - namespaces`, function() {
  helper.withDbForVersion();

  test('namespaces table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('namespaces_entities');
    await helper.assertNoTable('namespaces');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('namespaces_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('namespaces');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'index',
    entityTableName: 'namespaces_entities',
    newTableName: 'namespaces',
    EntityClass: NamespaceEntity,
    samples: {
      pptt: {
        parent: 'foo/foo',
        name: 'bar/bar',
        expires: fromNow('1 day'),
      },
      ...Object.fromEntries(_.range(5).map(i => ([
        `samp${i}`, {
          parent: `parent-${i}`,
          name: `name-${i}`,
          expires: fromNow('1 day'),
        }]))),
    },
    loadConditions: [
      {condition: {parent: 'foo/foo', name: 'bar/bar' }, expectedSample: 'pptt'},
      {condition: {parent: 'parent-1', name: 'name-1' }, expectedSample: 'samp1'},
    ],
    scanConditions: [
      // expected is ordered by the hashed parent
      {condition: {}, expectedSamples: ['samp4', 'pptt', 'samp3', 'samp1', 'samp2', 'samp0']},
      {condition: null, expectedSamples: ['samp4', 'pptt', 'samp3', 'samp1', 'samp2', 'samp0']},
    ],
    notFoundConditions: [
      {condition: {parent: 'no/such', name: 'no/such'}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {parent: 'foo/foo', name: 'bar/bar'},
      modifier: [
        ent => {
          ent.expires = new Date(2);
        },
      ],
      checker(ent) {
        assert.equal(ent.expires.toJSON(), new Date(2).toJSON());
      },
    }],
  });
});
