const assert = require('assert');
const fs = require('fs');
const {getCommonSchemas} = require('../src/common-schemas');
const {makeSerializable} = require('../src/serializable');
const mockFs = require('mock-fs');
const References = require('..');

suite('references_test.js', function() {
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
    // mock APIBuilder from taskcluster-lib-api
    const builder = {
      reference() {
        return {api: true};
      },
    };

    // mock Exchanges from taskcluster-lib-pulse
    const exchanges = {
      reference() {
        return {exchanges: true};
      },
    };

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

    const references = References.fromService({builder, exchanges, schemaset});
    assert(references.references.some(r => r.content.api));
    assert(references.references.some(r => r.content.exchanges));
    assert(references.schemas.some(s => s.content.$id === 'somefile.json#'));
  });

  test('makeSerializable', function() {
    assert.deepEqual(
      references.makeSerializable(),
      makeSerializable({references}));
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
          metadata: {name: 'api', version: 1},
          type: 'string',
        },
      }]),
    });

    references.writeUriStructured({directory: '/refdata'});
    assert.deepEqual(JSON.parse(fs.readFileSync('/refdata/schemas/test/sch.json')), {
      $id: '/schemas/test/sch.json#',
      $schema: '/schemas/common/metaschema.json#',
      metadata: {name: 'api', version: 1},
      type: 'string',
    });
  });

  test('empty references pass validation', function() {
    const references = new References({references: [], schemas: []});
    references.validate();
  });

  test('bogus references fail validation', function() {
    const references = new References({references: [], schemas: [
      {filename: 'bogus.json', content: {}},
    ]});
    assert.throws(
      () => references.validate(),
      'no $id');
  });
});
