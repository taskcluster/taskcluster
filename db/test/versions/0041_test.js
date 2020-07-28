const _ = require('lodash');
const helper = require('../helper');
const taskcluster = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/auth/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const ClientsEntity = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('clientId'),
  rowKey: Entity.keys.ConstantKey('client'),
  properties: {
    clientId: Entity.types.String,
    description: Entity.types.Text,
    accessToken: Entity.types.EncryptedText,
    expires: Entity.types.Date,
    details: Entity.types.Schema({
      type: 'object',
      properties: {
        created: {type: 'string', format: 'date-time'},
        lastModified: {type: 'string', format: 'date-time'},
        lastDateUsed: {type: 'string', format: 'date-time'},
        lastRotated: {type: 'string', format: 'date-time'},
        deleteOnExpiration: {type: 'boolean'},
      },
      required: [
        'created', 'lastModified', 'lastDateUsed', 'lastRotated',
        'deleteOnExpiration',
      ],
    }),
    scopes: Entity.types.JSON,
    disabled: Entity.types.Number,
  },
});

suite(`${testing.suiteName()} - clients`, function() {
  helper.withDbForVersion();

  test('clients table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('clients_entities');
    await helper.assertNoTable('clients');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('clients_entities');
    await helper.assertTable('clients');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('clients_entities');
    await helper.assertNoTable('clients');
  });

  const created = taskcluster.fromNow('-3 day');
  const lastModified = taskcluster.fromNow('-1 day');
  const lastDateUsed = taskcluster.fromNow('-1 hour');
  const lastRotated = taskcluster.fromNow('-2 day');
  const expires = taskcluster.fromNow('1 day');

  test('clients_entities rows properly migrated to clients rows', async function() {
    await helper.toDbVersion(PREV_VERSION);

    const db = await helper.setupDb('auth');
    const Client = await ClientsEntity.setup({
      db,
      serviceName: 'auth',
      tableName: 'clients_entities',
      monitor: false,
      context: {},
      cryptoKey: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
    });

    await Client.create({
      clientId: 'alex',
      description: 'Alex',
      accessToken: 'MbzikR5-QnmwSOUVivFssgp4v531ZTQKeaKk9L8l13mQ',
      expires,
      scopes: ['name:alex'],
      disabled: 0,
      details: {
        created: created.toJSON(),
        lastModified: lastModified.toJSON(),
        lastDateUsed: lastDateUsed.toJSON(),
        lastRotated: lastRotated.toJSON(),
        deleteOnExpiration: false,
      },
    });

    await Client.create({
      clientId: 'bo',
      description: 'Bo',
      accessToken: 'JtJCYVOTSLej5JKzTsqN6AJtJCYVOTSLej5JKzTsqN6A',
      expires,
      scopes: ['name:bo'],
      disabled: 1,
      details: {
        created: created.toJSON(),
        lastModified: lastModified.toJSON(),
        lastDateUsed: lastDateUsed.toJSON(),
        lastRotated: lastRotated.toJSON(),
        deleteOnExpiration: true,
      },
    });

    await helper.upgradeTo(THIS_VERSION);

    await helper.withDbClient(async client => {
      const res = await client.query('select * from clients order by client_id');

      // check the encrypted columns first, then delete them as they include a
      // random component (the initialization vector)
      const decryptedTokens = res.rows
        .map(({encrypted_access_token}) => db.decrypt({value: encrypted_access_token}).toString('utf8'));
      assert.deepEqual(decryptedTokens, [
        'MbzikR5-QnmwSOUVivFssgp4v531ZTQKeaKk9L8l13mQ',
        'JtJCYVOTSLej5JKzTsqN6AJtJCYVOTSLej5JKzTsqN6A',
      ]);
      res.rows.forEach(row => { delete row.encrypted_access_token; });

      // ignore etags
      res.rows.forEach(row => { delete row.etag; });

      assert.deepEqual(res.rows, [{
        client_id: 'alex',
        created,
        delete_on_expiration: false,
        description: 'Alex',
        disabled: false,
        expires,
        last_date_used: lastDateUsed,
        last_modified: lastModified,
        last_rotated: lastRotated,
        scopes: ['name:alex'],
      }, {
        client_id: 'bo',
        created,
        delete_on_expiration: true,
        description: 'Bo',
        disabled: true,
        expires,
        last_date_used: lastDateUsed,
        last_modified: lastModified,
        last_rotated: lastRotated,
        scopes: ['name:bo'],
      }]);
    });

    await helper.downgradeTo(PREV_VERSION);

    // all data is still present on downgrade.

    const results = await Client.scan({});
    assert.equal(results.entries[0].clientId, 'alex');
    assert.equal(results.entries[0].accessToken, 'MbzikR5-QnmwSOUVivFssgp4v531ZTQKeaKk9L8l13mQ');
    assert.deepEqual(results.entries[0].scopes, ['name:alex']);
    assert.equal(results.entries[1].clientId, 'bo');
    assert.equal(results.entries[1].accessToken, 'JtJCYVOTSLej5JKzTsqN6AJtJCYVOTSLej5JKzTsqN6A');
    assert.deepEqual(results.entries[1].scopes, ['name:bo']);
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'auth',
    entityTableName: 'clients_entities',
    newTableName: 'clients',
    EntityClass: ClientsEntity,
    cryptoKey: 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo',
    normalizeEntity: e => {
      // normalize the date formats in the details JSON, as postgres rounds milliseconds
      // differently from JS.  This is harmless in production, but causes string comparisons
      // to fail in tests.
      e.details.created = new Date(e.details.created).toJSON();
      e.details.lastModified = new Date(e.details.lastModified).toJSON();
      e.details.lastDateUsed = new Date(e.details.lastDateUsed).toJSON();
      e.details.lastRotated = new Date(e.details.lastRotated).toJSON();
      return e;
    },
    samples: {
      alex: {
        clientId: 'alex',
        description: 'Alex',
        accessToken: 'MbzikR5-QnmwSOUVivFssgp4v531ZTQKeaKk9L8l13mQ',
        expires,
        scopes: ['name:alex'],
        disabled: 0,
        details: {
          created: created.toJSON(),
          lastModified: lastModified.toJSON(),
          lastDateUsed: lastDateUsed.toJSON(),
          lastRotated: lastRotated.toJSON(),
          deleteOnExpiration: false,
        },
      },
      bo: {
        clientId: 'bo',
        description: 'Bo',
        accessToken: 'JtJCYVOTSLej5JKzTsqN6AJtJCYVOTSLej5JKzTsqN6A',
        expires,
        scopes: ['name:bo'],
        disabled: 1,
        details: {
          created: created.toJSON(),
          lastModified: lastModified.toJSON(),
          lastDateUsed: lastDateUsed.toJSON(),
          lastRotated: lastRotated.toJSON(),
          deleteOnExpiration: true,
        },
      },
    },
    loadConditions: [
      {condition: {clientId: 'alex'}, expectedSample: 'alex'},
      {condition: {clientId: 'bo'}, expectedSample: 'bo'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['alex', 'bo']},
      {condition: null, expectedSamples: ['alex', 'bo']},
      {condition: {expires: Entity.op.lessThan(taskcluster.fromNow('0 days'))}, expectedSamples: []},
      {condition: {expires: Entity.op.lessThan(taskcluster.fromNow('3 days'))}, expectedSamples: ['alex', 'bo']},
    ],
    notFoundConditions: [
      {condition: {clientId: 'chris'}},
    ],
    notImplemented: [],
    modifications: [{
      condition: {clientId: 'alex'},
      modifier: [
        ent => {
          ent.accessToken = 'Zepk80t8SMyuXOQ-d5Qb-QByVetP4DSSu-7QA3zDtAMg';
        },
        ent => {
          ent.description = 'helloo';
        },
        ent => {
          ent.details.lastModified = lastDateUsed.toJSON();
        },
        ent => {
          ent.details.deleteOnExpiration = true;
        },
      ],
      checker(ent) {
        assert.equal(ent.accessToken, 'Zepk80t8SMyuXOQ-d5Qb-QByVetP4DSSu-7QA3zDtAMg');
        assert.equal(ent.description, 'helloo');
        assert.equal(ent.details.deleteOnExpiration, true);
        assert.deepEqual(new Date(ent.details.lastModified), new Date(lastDateUsed.toJSON()));
      },
    }],
  });
});
