const assert = require('assert');
const fs = require('fs');
const { getCommonSchemas } = require('../src/common-schemas');
const { makeSerializable } = require('../src/serializable');
const mockFs = require('mock-fs');
const References = require('..');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  teardown(function() {
    mockFs.restore();
  });

  const references = new References({
    schemas: getCommonSchemas(),
    references: [],
  });

  test('getSchema', function() {
    assert.equal(
      references.getSchema('/schemas/common/manifest-v3.json#').$id,
      '/schemas/common/manifest-v3.json#');
  });

  test('fromService', function() {
    // mock SchemaSet from taskcluster-lib-validate
    const schemaset = {
      abstractSchemas() {
        return {
          'somefile.json': {
            $id: 'somefile.json#',
          },
        };
      },
    };

    const references = References.fromService({
      schemaset,
      references: [
        {
          $schema: '/schemas/common/v1/api-reference.json#',
          serviceName: 'testy',
          apiVersion: 'v2',
        },
      ] });
    assert(references.references.some(r => r.content.serviceName === 'testy'));
    assert(references.schemas.some(s => s.content.$id === 'somefile.json#'));
  });

  test('makeSerializable', function() {
    assert.deepEqual(
      references.makeSerializable(),
      makeSerializable({ references }));
  });

  test('writes uri-structured', function() {
    mockFs({});
    const references = new References({
      references: [
        {
          filename: 'some-reference.yml',
          content: {
            $schema: '/schemas/common/api-reference-v0.json#',
            apiVersion: 'v2',
            serviceName: 'test',
            title: 'Test Service',
            description: 'Test Service',
            entries: [{
              type: 'function',
              name: 'foo',
              title: 'Foo',
              description: 'Foo-bar',
              category: 'Foo',
              method: 'get',
              input: 'sch.json#',
              route: '/foo',
              args: [],
              stability: 'experimental',
            }],
          },
        },
      ],
      schemas: getCommonSchemas().concat([{
        filename: 'foo.json',
        content: {
          $schema: '/schemas/common/metaschema.json#',
          $id: '/schemas/test/sch.json#',
          metadata: { name: 'api', version: 1 },
          type: 'string',
        },
      }]),
    });

    references.writeUriStructured({ directory: '/refdata' });
    assert.deepEqual(JSON.parse(fs.readFileSync('/refdata/schemas/test/sch.json')), {
      $id: '/schemas/test/sch.json#',
      $schema: '/schemas/common/metaschema.json#',
      metadata: { name: 'api', version: 1 },
      type: 'string',
    });
  });

  test('empty references pass validation', function() {
    const references = new References({ references: [], schemas: [] });
    references.validate();
  });

  test('bogus references fail validation', function() {
    const references = new References({ references: [], schemas: [
      { filename: 'bogus.json', content: {} },
    ] });
    assert.throws(
      () => references.validate(),
      'no $id');
  });
});
