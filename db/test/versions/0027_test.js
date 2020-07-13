const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/auth/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const RolesEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('role'),
  rowKey: Entity.keys.ConstantKey('role'),
  properties: {
    blob: Entity.types.Schema({
      title: 'Roles',
      type: 'array',
      items: {
        type: 'object',
        properties: {
          roleId: {
            type: 'string',
            pattern: '^[\\x20-\\x7e]+$',
          },
          scopes: {
            type: 'array',
            items: {
              type: 'string',
              pattern: '^[\x20-\x7e]*$',
            },
          },
          description: {
            type: 'string',
            maxLength: 1024 * 10,
          },
          lastModified: {
            type: 'string',
            format: 'date-time',
          },
          created: {
            type: 'string',
            format: 'date-time',
          },
        },
        additionalProperties: false,
        required: ['roleId', 'scopes', 'description', 'lastModified', 'created'],
      },
    }),
  },
});

suite(`${testing.suiteName()} - roles`, function() {
  helper.withDbForVersion();

  test('roles table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('roles_entities');
    await helper.assertNoTable('roles');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('roles_entities');
    await helper.assertTable('roles');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('roles_entities');
    await helper.assertNoTable('roles');
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'auth',
    entityTableName: 'roles_entities',
    newTableName: 'roles',
    EntityClass: RolesEntity,
    samples: {
      blob: {
        blob: [{
          roleId: "user-group:cool-people",
          scopes: ["assume:some-other-role"],
          created: "2019-10-30T19:31:12.846Z",
          description: "cool people get scopes",
          lastModified: "2020-05-14T01:12:21.782Z",
        }, {
          roleId: "user-group:boring-people",
          scopes: ["boring-service:nothing"],
          created: "2019-10-30T19:31:12.846Z",
          description: "boring people get one scope",
          lastModified: "2020-05-14T01:12:21.782Z",
        }],
      },
    },
    loadConditions: [
      {condition: {}, expectedSample: 'blob'},
    ],
    scanConditions: [], // scan is not implemneted
    notFoundConditions: [],
    notImplemented: ['create-overwrite', 'remove'],
    modifications: [{
      condition: {},
      modifier: [
        ent => {
          _.find(ent.blob, {roleId: 'user-group:cool-people'}).description = 'not cool';
        },
        ent => {
          _.find(ent.blob, {roleId: 'user-group:boring-people'}).description = 'not boring';
        },
      ],
      checker(ent) {
        assert.deepEqual(ent.blob.map(r => r.description), [
          'not cool',
          'not boring',
        ]);
      },
    }],
  });
});
