const helper = require('../helper');
const { fromNow } = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');
const tcdb = require('taskcluster-db');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');
const slugid = require('slugid');

const THIS_VERSION = 9;
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

function withEntity(db) {
  return CachePurgeEntity.setup({
    db,
    serviceName: 'purge_cache',
    tableName: 'cache_purges_entities',
    monitor: false,
    context: {},
  });
}

function withDb() {
  return tcdb.setup({
    readDbUrl: helper.dbUrl,
    writeDbUrl: helper.dbUrl,
    serviceName: 'purge_cache',
    useDbDirectory: true,
    monitor: false,
  });
}

function makeDocument(props = {}) {
  return {
    provisionerId: `${slugid.v4()}/%2F/${slugid.v4()}`,
    workerType: `${slugid.v4()}/%2F/${slugid.v4()}`,
    cacheName: `${slugid.v4()}/%2F/${slugid.v4()}`,
    before: new Date(0),
    expires: new Date(0),
    ...props,
  };
}

async function insertDocuments(CachePurge, num) {
  const documents = [];
  for (let i = 0; i < num; i++) {
    const entry = await CachePurge.create(makeDocument({
      provisionerId: `provisionerId-${i}`,
      workerType: `workerType-${i}`,
      cacheName: `cacheName-${i}`,
      before: new Date(1),
      expires: new Date(2),
    }));

    documents.push(entry);
  }

  return documents;
}

function compare(itemA, itemB) {
  assert(itemA.provisionerId === itemB.provisionerId);
  assert(itemA.workerType === itemB.workerType);
  assert(itemA.cacheName === itemB.cacheName);
  assert(itemA.before.toJSON() === itemB.before.toJSON());
  assert(itemA.expires.toJSON() === itemB.expires.toJSON());
}

function runEntitiesTests(withPreviousVersion) {
  createTests(withPreviousVersion);
  loadTests(withPreviousVersion);
  modifyTests(withPreviousVersion);
  removeTests(withPreviousVersion);
  scanTests(withPreviousVersion);
}

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('cache_purges table created', async function() {
    await helper.assertNoTable('cache_purges');
    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('cache_purges');
    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('cache_purges');
  });

  test('cache purges data migrated on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('cache_purges_entities');
    await helper.assertNoTable('cache_purges');

    const db = await withDb();
    const CachePurge = await withEntity(db);

    const row = {
      provisionerId: 'prov-1',
      workerType: 'wt-1',
      cacheName: 'cn-1',
      before: fromNow(),
      expires: fromNow('1 year'),
    };
    await CachePurge.create(row);

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('cache_purges_entities');

    await helper.withDbClient(async client => {
      const res = await client.query(
        `select * from cache_purges where provisioner_id = $1 and worker_type = $2 and cache_name = $3`, [row.provisionerId, row.workerType, row.cacheName]);
      assert.equal(res.rows[0].provisioner_id, row.provisionerId);
      assert.equal(res.rows[0].worker_type, row.workerType);
      assert.equal(res.rows[0].cache_name, row.cacheName);
      assert.equal(res.rows[0].before.toJSON(), row.before.toJSON());
      assert.equal(res.rows[0].expires.toJSON(), row.expires.toJSON());
    });

    const upgraded = await CachePurge.load({
      provisionerId: row.provisionerId,
      workerType: row.workerType,
      cacheName: row.cacheName,
    });
    for (let prop of Object.keys(row)) {
      assert.deepEqual(upgraded[prop], row[prop]);
    }

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('cache_purges');

    const roundtrip = await CachePurge.load({
      provisionerId: row.provisionerId,
      workerType: row.workerType,
      cacheName: row.cacheName,
    });
    for (let prop of Object.keys(row)) {
      assert.deepEqual(roundtrip[prop], row[prop]);
    }
  });

  runEntitiesTests(false);
  runEntitiesTests(true);
});

function loadTests(withPreviousVersion) {
  suite(`purge_caches_entities_load v${withPreviousVersion ? PREV_VERSION : THIS_VERSION}`, function() {
    suiteSetup(async function() {
      await testing.resetDb({testDbUrl: helper.dbUrl});
      await helper.upgradeTo(THIS_VERSION);

      if (withPreviousVersion) {
        await helper.downgradeTo(PREV_VERSION);
      }
    });
    setup('reset table', async function() {
      await helper.withDbClient(async client => {
        if (withPreviousVersion) {
          await client.query('delete from cache_purges_entities');
        } else {
          await client.query('delete from cache_purges');
        }
      });
    });
    test('load entry', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const [entry] = await insertDocuments(CachePurge, 1);
      const result = await CachePurge.load({
        provisionerId: entry.provisionerId,
        workerType: entry.workerType,
        cacheName:
        entry.cacheName,
      });

      assert.equal(result.provisionerId, entry.provisionerId);
      assert.equal(result.workerType, entry.workerType);
      assert.equal(result.cacheName, entry.cacheName);
    });
    test('load entry (throws when not found)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      await assert.rejects(
        async () => {
          await CachePurge.load({ provisionerId: '-', workerType: '-', cacheName: '-' });
        },
        (err => {
          assert.equal(err.code, "ResourceNotFound");
          assert.equal(err.statusCode, 404);

          return true;
        }),
      );
    });
    test('load entry (ignoreIfNotExists)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const result = await CachePurge.load({ provisionerId: '-', workerType: '-', cacheName: '-' }, true);

      assert.equal(result, null);
    });
  });
}

function scanTests(withPreviousVersion) {
  suite(`purge_caches_entities_scan v${withPreviousVersion ? PREV_VERSION : THIS_VERSION}`, function() {
    suiteSetup(async function() {
      await testing.resetDb({testDbUrl: helper.dbUrl});
      await helper.upgradeTo(THIS_VERSION);

      if (withPreviousVersion) {
        await helper.downgradeTo(PREV_VERSION);
      }
    });
    setup('reset table', async function() {
      await helper.withDbClient(async client => {
        if (withPreviousVersion) {
          await client.query('delete from cache_purges_entities');
        } else {
          await client.query('delete from cache_purges');
        }
      });
    });

    test('retrieve all on empty db', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      const result = await CachePurge.scan();

      assert(result.entries instanceof Array);
      assert.equal(result.entries.length, 0);
    });

    test('retrieve all documents (condition set to undefined)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      await insertDocuments(CachePurge, 10);
      const result = await CachePurge.scan();

      assert.equal(result.entries.length, 10);
    });

    test('retrieve all documents (condition set to null)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      await insertDocuments(CachePurge, 10);
      const result = await CachePurge.scan(null);

      assert.equal(result.entries.length, 10);
    });

    test('retrieve documents (with limit)', async function () {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      await insertDocuments(CachePurge, 10);
      const result = await CachePurge.scan(null, { limit: 4 });

      assert.equal(result.entries.length, 4);
    });
    test('retrieve all documents (with condition)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      await CachePurge.create({
        provisionerId: 'provisionerId-1',
        workerType: 'workerType-1',
        cacheName: 'cacheName-1',
        before: new Date(1),
        expires: new Date(1),
      });
      await CachePurge.create({
        provisionerId: 'provisionerId-2',
        workerType: 'workerType-2',
        cacheName: 'cacheName-2',
        before: new Date(2),
        expires: new Date(2),
      });

      const result = await CachePurge.scan({
        expires: Entity.op.lessThan(new Date(2)),
      });

      assert.equal(result.entries.length, 1);
      assert.deepEqual(result.entries[0].provisionerId, 'provisionerId-1');
    });
    test('retrieve documents (with equality date condition)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = { provisionerId: 'test', workerType: 'test', before: new Date(0) };
      await CachePurge.create({ ...document, cacheName: '1', expires: new Date('2020-01-01') });
      await CachePurge.create({ ...document, cacheName: '2', expires: new Date('3020-01-01') });
      await CachePurge.create({ ...document, cacheName: '3', expires: new Date('4020-01-01') });

      const result = await CachePurge.scan({
        expires: Entity.op.equal(new Date('2020-01-01')),
      });

      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].cacheName, '1');
      assert.equal(result.entries[0].expires.toJSON(), new Date('2020-01-01').toJSON());
    });
    test('retrieve documents (with comparison date condition)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = { provisionerId: 'test', workerType: 'test', before: new Date(0) };
      await CachePurge.create({ ...document, cacheName: '1', expires: new Date('2020-01-01') });
      await CachePurge.create({ ...document, cacheName: '2', expires: new Date('3020-01-01') });
      await CachePurge.create({ ...document, cacheName: '3', expires: new Date('4020-01-01') });

      const result = await CachePurge.scan({
        expires: Entity.op.greaterThan(new Date('3020-01-01')),
      });

      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].cacheName, '3');
      assert.equal(result.entries[0].expires.toJSON(), new Date('4020-01-01').toJSON());
    });
    test('retrieve documents in pages', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      const documents = await insertDocuments(CachePurge, 10);

      let result = await CachePurge.scan(null, {
        limit: 4,
      });

      assert.equal(result.entries.length, 4);
      assert.deepEqual(result.entries[0], documents[0]);
      assert.deepEqual(result.entries[1], documents[1]);
      assert.deepEqual(result.entries[2], documents[2]);
      assert.deepEqual(result.entries[3], documents[3]);

      result = await CachePurge.scan(null, {
        continuation: result.continuation,
        limit: 4,
      });

      assert.equal(result.entries.length, 4);
      assert.deepEqual(result.entries[0], documents[4]);
      assert.deepEqual(result.entries[1], documents[5]);
      assert.deepEqual(result.entries[2], documents[6]);
      assert.deepEqual(result.entries[3], documents[7]);

      result = await CachePurge.scan(null, {
        continuation: result.continuation,
        limit: 4,
      });

      assert.equal(result.entries.length, 2);
      assert.deepEqual(result.entries[0], documents[8]);
      assert.deepEqual(result.entries[1], documents[9]);
      assert(!result.continuation);
    });
    test('retrieve documents with continuation but no limit', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);

      const documents = await insertDocuments(CachePurge, 2);

      let result = await CachePurge.scan(null, {
        limit: 1,
      });

      assert.equal(result.entries.length, 1);
      assert.deepEqual(result.entries[0], documents[0]);

      result = await CachePurge.scan(null, {
        continuation: result.continuation,
      });

      assert.equal(result.entries.length, 1);
      assert.deepEqual(result.entries[0], documents[1]);
      assert(!result.continuation);
    });
  });
}

function modifyTests(withPreviousVersion) {
  suite(`purge_caches_entities_modify v${withPreviousVersion ? PREV_VERSION : THIS_VERSION}`, function() {
    suiteSetup(async function() {
      await testing.resetDb({testDbUrl: helper.dbUrl});
      await helper.upgradeTo(THIS_VERSION);

      if (withPreviousVersion) {
        await helper.downgradeTo(PREV_VERSION);
      }
    });
    setup('reset table', async function() {
      await helper.withDbClient(async client => {
        if (withPreviousVersion) {
          await client.query('delete from cache_purges_entities');
        } else {
          await client.query('delete from cache_purges');
        }
      });
    });
    test('Item.create, Item.modify, Item.load', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      const newBefore = new Date(1);

      return CachePurge.create(document)
        .then(function(item) {
          assert(item instanceof CachePurge);
          compare(item, document);
          return item.modify(function(entry) {
            entry.before = new Date(1);
          }).then(function(item2) {
            assert(item instanceof CachePurge);
            assert(item2 instanceof CachePurge);
            assert(item.before.toJSON() === newBefore.toJSON());
            assert(item2.before.toJSON() === newBefore.toJSON());
            compare(item, { ...document, before: newBefore });
            compare(item2, { ...document, before: newBefore });
            assert(item === item2);
          });
        }).then(function() {
          return CachePurge.load({
            provisionerId: document.provisionerId,
            workerType: document.workerType,
            cacheName: document.cacheName,
          });
        }).then(function(item) {
          assert(item instanceof CachePurge);
          compare(item, { ...document, before: newBefore });
        });
    });
    test('Item.create, Item.modify, throw error', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      const err = new Error('Testing that errors in modify works');

      return CachePurge.create(document).then(function(item) {
        return item.modify(function() {
          throw err;
        });
      }).then(function() {
        assert(false, 'Expected an error');
      }, function(err2) {
        assert(err === err2, 'Expected the error I threw!');
      });
    });
    test('Item.modify a deleted item', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      const newBefore = new Date(1);
      let deletedItem;
      return CachePurge.create(document).then(function(item) {
        deletedItem = item;
        return CachePurge.remove({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        });
      }).then(function() {
        return deletedItem.modify(function(item) {
          item.before = newBefore;
        });
      }).then(function() {
        assert(false, 'Expected an error');
      }, function(err) {
        assert(err.code === 'ResourceNotFound', 'Expected ResourceNotFound');
        assert(err.statusCode === 404, 'Expected 404');
      });
    });

    test('Item.create, Item.modify (first argument), Item.load', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      const newBefore = new Date(1);
      return CachePurge.create(document).then(function(item) {
        assert(item instanceof CachePurge);
        compare(item, document);
        return item.modify(function(item) {
          item.before = newBefore;
        });
      }).then(function(item) {
        assert(item instanceof CachePurge);
        compare(item, { ...document, before: newBefore });
        return CachePurge.load({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        });
      }).then(function(item) {
        assert(item instanceof CachePurge);
        compare(item, { ...document, before: newBefore });
      });
    });

    test('Item.modify (concurrent)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.create(document).then(function(itemA) {
        return CachePurge.load({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        }).then(function(itemB) {
          return Promise.all([
            itemA.modify(function() {
              // add a day
              this.before = new Date(this.before.getDate() + 1);
            }),
            itemB.modify(function() {
              this.before = new Date(this.before.getDate() + 1);
            }),
          ]);
        });
      }).then(function() {
        return CachePurge.load({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        });
      }).then(function(item) {
        assert(item instanceof CachePurge);
        compare(item, { ...document, before: new Date(new Date(new Date(1).getDate() + 1).getDate() + 1)});
      });
    });
  });
}

function removeTests(withPreviousVersion) {
  suite(`purge_caches_entities_remove v${withPreviousVersion ? PREV_VERSION : THIS_VERSION}`, function() {
    suiteSetup(async function() {
      await testing.resetDb({testDbUrl: helper.dbUrl});
      await helper.upgradeTo(THIS_VERSION);

      if (withPreviousVersion) {
        await helper.downgradeTo(PREV_VERSION);
      }
    });
    setup('reset table', async function() {
      await helper.withDbClient(async client => {
        if (withPreviousVersion) {
          await client.query('delete from cache_purges_entities');
        } else {
          await client.query('delete from cache_purges');
        }
      });
    });
    test('Item.create, item.remove', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();

      return CachePurge.create(document).then(function(item) {
        assert(item instanceof CachePurge);
        compare(item, document);
        return item.remove();
      }).then(function() {
        return CachePurge.load({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        });
      }).catch(function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });
    test('Item.create, Item.remove', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.create(document).then(function(item) {
        return CachePurge.remove({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        });
      }).then(function() {
        return CachePurge.load({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        });
      }).catch(function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });

    test('Item.remove (error when doesn\'t exist)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.remove({
        provisionerId: document.provisionerId,
        workerType: document.workerType,
        cacheName: document.cacheName,
      }).catch(function(err) {
        assert(err.code === 'ResourceNotFound');
      });
    });

    test('Item.remove (ignoreIfNotExists)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.remove({
        provisionerId: document.provisionerId,
        workerType: document.workerType,
        cacheName: document.cacheName,
      }, true);
    });

    test('Item.create, item.remove (abort if changed)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.create(document).then(function(itemA) {
        return CachePurge.load({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        }).then(function(itemB) {
          return itemB.modify(function() {
            this.before = new Date(1);
          });
        }).then(function() {
          return itemA.remove();
        });
      }).catch(function(err) {
        assert(err.code === 'UpdateConditionNotSatisfied');
      });
    });

    test('Item.create, item.remove (ignore changes)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.create(document).then(function(itemA) {
        return CachePurge.load({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        }).then(function(itemB) {
          return itemB.modify(function() {
            this.before = new Date(1);
          });
        }).then(function() {
          return itemA.remove(true);
        });
      });
    });

    test('Item.create, item.remove (ignoreIfNotExists)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.create(document).then(function(itemA) {
        return itemA.remove(false, false).then(function() {
          return itemA.remove(false, true);
        });
      });
    });

    test('Item.create, Item.remove (ignoreIfNotExists)', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();
      return CachePurge.create(document).then(function() {
        return CachePurge.remove({
          provisionerId: document.provisionerId,
          workerType: document.workerType,
          cacheName: document.cacheName,
        }, false).then(function(result) {
          assert(result === true, 'Expected true');
          return CachePurge.remove({
            provisionerId: document.provisionerId,
            workerType: document.workerType,
            cacheName: document.cacheName,
          }, true).then(function(result) {
            assert(result === false, 'Expected false');
          });
        });
      });
    });
  });
}

function createTests(withPreviousVersion) {
  suite(`purge_caches_entities_create v${withPreviousVersion ? PREV_VERSION : THIS_VERSION}`, function() {
    suiteSetup(async function() {
      await testing.resetDb({testDbUrl: helper.dbUrl});
      await helper.upgradeTo(THIS_VERSION);

      if (withPreviousVersion) {
        await helper.downgradeTo(PREV_VERSION);
      }
    });
    setup('reset table', async function() {
      await helper.withDbClient(async client => {
        if (withPreviousVersion) {
          await client.query('delete from cache_purges_entities');
        } else {
          await client.query('delete from cache_purges');
        }
      });
    });
    test('create entry', async function() {
      const db = await withDb();
      const CachePurge = await withEntity(db);
      const document = makeDocument();

      await CachePurge.create(document);

      const result = await CachePurge.load({
        provisionerId: document.provisionerId,
        workerType: document.workerType,
        cacheName: document.cacheName,
      });

      compare(result, document);
      assert(result._etag);
    });
  });
}
