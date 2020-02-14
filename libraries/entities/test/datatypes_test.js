const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const { Entity } = require('taskcluster-lib-entities');
const path = require('path');
const assert = require('assert').strict;
const _ = require('lodash');
const crypto = require('crypto');
const slugid = require('slugid');

helper.dbSuite(path.basename(__filename), function() {
  let db;

  teardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
  const serviceName = 'test-entities';

  [
    {
      context: 'Entity.types.String',
      options: {
        type: Entity.types.String,
        sample1: 'Hello World',
        sample2: 'Hello World Again',
      },
    },
    {
      context: 'Entity.types.Boolean',
      options: {
        type: Entity.types.Boolean,
        sample1: false,
        sample2: true,
      },
    },
    {
      context: 'Entity.types.Number (float)',
      options: {
        type: Entity.types.Number,
        sample1: 42.3,
        sample2: 56.7,
      },
    },
    {
      context: 'Entity.types.Number (large)',
      options: {
        type: Entity.types.Number,
        sample1: 12147483648,
        sample2: 13147483648,
      },
    },
    {
      context: 'Entity.types.Number (int)',
      options: {
        type: Entity.types.Number,
        sample1: 45,
        sample2: 1256,
      },
    },
    {
      context: 'Entity.types.PositiveInteger',
      options: {
        type: Entity.types.Number,
        sample1: 455,
        sample2: 125236,
      },
    },
    {
      context: 'Entity.types.Date',
      options: {
        type: Entity.types.Date,
        sample1: new Date(),
        sample2: new Date('2015-09-01T03:47:24.883Z'),
      },
    },
    // {
    //   context: 'Entity.types.UUID',
    //   options: {
    //     type: Entity.types.UUID,
    //     sample1: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', // v4 uuid
    //     sample2: '37175f00-505c-11e5-ad72-69c56eeb1d01',  // v1 uuid
    //   },
    // },
    {
      context: 'Entity.types.SlugId',
      options: {
        type: Entity.types.SlugId,
        sample1: 'nvItOmAyRiOvSSWCAHkobQ',
        sample2: 'NgmMmc_oQZ-dC4nPzWI1Ug',
      },
    },
    {
      context: 'Entity.types.JSON',
      options: {
        type: Entity.types.JSON,
        sample1: {subobject: {number: 42}, array: [1, 2, 3, 4, 'string']},
        sample2: {subobject: {number: 51}, array: [1, 2, 3, 4, 5, 'string']},
      },
    },
    {
      context: 'Entity.types.Schema',
      options: {
        type: Entity.types.Schema({
          type: 'object', required: ['subobject', 'array'],
        }),
        sample1: {subobject: {number: 42}, array: [1, 2, 3, 4, 'string']},
        sample2: {subobject: {number: 51}, array: [1, 2, 3, 4, 5, 'string']},
      },
    },
    // {
    //   context: 'Entity.types.Blob',
    //   options: {
    //     type: Entity.types.Blob,
    //     sample1: crypto.randomBytes(10 * 1000),
    //     sample2: crypto.randomBytes(100 * 1000),
    //   },
    // },
    {
      context: 'Entity.types.Text',
      options: {
        type: Entity.types.Text,
        sample1: 'Hello World\n could be a very long string',
        sample2: crypto.randomBytes(100 * 1000).toString('base64'),
      },
    },
    // SlugIdArray cannot be tested with _.isEqual, we also have separate tests for
    // this EntityType.
    {
      context: 'Entity.types.EncryptedJSON',
      options: {
        type: Entity.types.EncryptedJSON,
        sample1: {subobject: {number: 42}, array: [1, 2, 3, 4, 'string']},
        sample2: {subobject: {number: 51}, array: [1, 2, 3, 4, 5, 'string']},
        encryptedTestOnly: true,
      },
    },
    {
      context: 'Entity.types.EncryptedSchema',
      options: {
        type: Entity.types.EncryptedSchema({
          type: 'object', required: ['subobject', 'array'],
        }),
        sample1: {subobject: {number: 42}, array: [1, 2, 3, 4, 'string']},
        sample2: {subobject: {number: 51}, array: [1, 2, 3, 4, 5, 'string']},
        encryptedTestOnly: true,
      },
    },
    {
      context: 'Entity.types.EncryptedText',
      options: {
        type: Entity.types.EncryptedText,
        sample1: 'Hello World\n could be a very long string',
        sample2: crypto.randomBytes(100 * 1000).toString('base64'),
        encryptedTestOnly: true,
      },
    },
    // {
    //   context: 'Entity.types.EncryptedBlob',
    //   options: {
    //     type: Entity.types.EncryptedBlob,
    //     sample1: crypto.randomBytes(10 * 1000),
    //     sample2: crypto.randomBytes(100 * 1000),
    //     encryptedTestOnly: true,
    //   },
    // },
  ].forEach(context => {
    suite(`Entity (create/load/modify DataTypes) ${context.context}`, function() {
      const { encryptedTestOnly } = context.options;
      const { type, sample1, sample2 } = context.options;

      assert(!_.isEqual(sample1, sample2), 'Samples should not be equal!');

      if (!encryptedTestOnly) {
        test('raw datatype', async function() {
          db = await helper.withDb({ schema, serviceName });
          let Item = Entity.configure({
            version: 1,
            partitionKey: Entity.keys.StringKey('id'),
            rowKey: Entity.keys.StringKey('name'),
            properties: {
              id: Entity.types.String,
              name: Entity.types.String,
              data: type,
            },
          }).setup({ tableName: 'test_entities', db, serviceName });

          let id = slugid.v4();
          return Item.create({
            id: id,
            name: 'my-test-item',
            data: sample1,
          }).then(function(itemA) {
            return Item.load({
              id: id,
              name: 'my-test-item',
            }).then(function(itemB) {
              assert(_.isEqual(itemA.data, sample1));
              assert(_.isEqual(itemA.data, itemB.data));
              assert(itemA.etag === itemB.etag);
              return itemB;
            });
          }).then(function(item) {
            return item.modify(function(item) {
              item.data = sample2;
            });
          }).then(function(itemA) {
            return Item.load({
              id: id,
              name: 'my-test-item',
            }).then(function(itemB) {
              assert(_.isEqual(itemA.data, sample2));
              assert(_.isEqual(itemA.data, itemB.data));
              assert(itemA.etag === itemB.etag);
              return itemB.modify(function(item) {
                item.data = sample1;
              });
            }).then(function(itemB) {
              assert(_.isEqual(itemA.data, sample2));
              return itemA.reload().then(function() {
                assert(_.isEqual(itemA.data, sample1));
                assert(_.isEqual(itemA.data, itemB.data));
                assert(itemA.etag === itemB.etag);
              }).then(function() {
                // Try parallel edit
                let count = 0;
                let noop = 0;
                return Promise.all([
                  itemA.modify(function(item) {
                    count++;
                    if (_.isEqual(item.data, sample2)) {
                      noop++;
                    }
                    item.data = sample2;
                  }),
                  itemB.modify(function(item) {
                    count++;
                    if (_.isEqual(item.data, sample2)) {
                      noop++;
                    }
                    item.data = sample2;
                  }),
                ]).then(function() {
                  assert(count === 3, 'Expected 3 edits, 2 initial + 1 conflict');
                  assert(noop === 1, 'Expected 1 noop edit');
                  assert(_.isEqual(itemA.data, sample2));
                  assert(_.isEqual(itemB.data, sample2));
                  assert(_.isEqual(itemA.data, itemB.data));
                  // Check that etags match, otherwise we might have updated even when not needed
                  assert(itemA.etag);
                  assert(itemB.etag);
                });
              });
            });
          });
        });

        test('signEntities', async function() {
          db = await helper.withDb({ schema, serviceName });
          let Item = Entity.configure({
            version: 1,
            partitionKey: Entity.keys.StringKey('id'),
            rowKey: Entity.keys.ConstantKey('signing-test-item'),
            signEntities: true,
            properties: {
              id: Entity.types.String,
              data: type,
            },
          }).setup({
            signingKey: 'my-super-secret',
            tableName: 'test_entities',
            db,
            serviceName,
          });
          let id = slugid.v4();
          return Item.create({
            id: id,
            data: sample1,
          }).then(function(itemA) {
            return Item.load({
              id: id,
            }).then(function(itemB) {
              assert(_.isEqual(itemA.data, itemB.data));
              assert(_.isEqual(itemA.data, sample1));
              return itemB;
            });
          }).then(function(item) {
            return item.modify(function(item) {
              item.data = sample2;
            });
          }).then(function(itemA) {
            return Item.load({
              id: id,
            }).then(function(itemB) {
              assert(_.isEqual(itemA.data, itemB.data));
              assert(_.isEqual(itemA.data, sample2));
            });
          });
        });

        test('signEntities detect invalid key', async function() {
          db = await helper.withDb({ schema, serviceName });
          let ItemClass = Entity.configure({
            version: 1,
            partitionKey: Entity.keys.StringKey('id'),
            rowKey: Entity.keys.ConstantKey('signing-test-item'),
            signEntities: true,
            properties: {
              id: Entity.types.String,
              data: type,
            },
          });
          let Item1 = ItemClass.setup({
            signingKey: 'my-super-secret',
            tableName: 'test_entities',
            db,
            serviceName,
          });
          let Item2 = ItemClass.setup({
            tableName: 'test_entities',
            db,
            serviceName,
            signingKey: 'super-wrong-secret',
          });
          let id = slugid.v4();
          return Item1.create({
            id: id,
            data: sample1,
          }).then(function(itemA) {
            return Item2.load({id: id}).then(function() {
              assert(false, 'Expected an error');
            }, function(e) {
              return Item1.load({id: id});
            }).then(function(itemB) {
              assert(_.isEqual(itemA.data, itemB.data));
              assert(_.isEqual(itemA.data, sample1));
              return itemB;
            });
          }).then(function(item) {
            return item.modify(function(item) {
              item.data = sample2;
            });
          }).then(function(itemA) {
            return Item1.load({
              id: id,
            }).then(function(itemB) {
              assert(_.isEqual(itemA.data, itemB.data));
              assert(_.isEqual(itemA.data, sample2));
            });
          }).then(function() {
            return Item2.load({id: id}).then(function() {
              assert(false, 'Expected an error');
            }, function() {
              // Ignore expected error
            });
          });
        });
      }
    });
  });
});
