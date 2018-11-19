const assert = require('assert');
const fs = require('fs');
const {getCommonSchemas} = require('../src/common-schemas');
const libUrls = require('taskcluster-lib-urls');
const {makeSerializable} = require('../src/serializable');
const mockFs = require('mock-fs');
const merge = require('lodash/merge');
const omit = require('lodash/omit');
const References = require('..');

suite('references_test.js', function() {
  const rootUrl = libUrls.testRootUrl();

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

  test('makeSerializable', function() {
    assert.deepEqual(
      references.makeSerializable(),
      makeSerializable({references}));
  });

  test('writes uri-structured', function() {
    mockFs({});
    const references = new References({
      references: [],
      schemas: getCommonSchemas().concat([{
        filename: 'foo.json',
        content: {
          $schema: '/schemas/common/metadata-metaschema.json#',
          $id: '/schemas/test/sch.json#',
          metadata: {name: 'api', version: 1},
          type: 'string',
        },
      }]),
    });

    references.writeUriStructured({directory: '/refdata'});
    assert.deepEqual(JSON.parse(fs.readFileSync('/refdata/schemas/test/sch.json')), {
      $id: '/schemas/test/sch.json#',
      $schema: '/schemas/common/metadata-metaschema.json#',
      metadata: {name: 'api', version: 1},
      type: 'string',
    });
  });

  suite('validate', function() {
    class RefBuilder {
      constructor() {
        this.schemas = [...getCommonSchemas()];
        this.references = [];
      }

      schema({omitPaths=[], filename='test-schema.yml', ...content}) {
        this.schemas.push({
          filename,
          content: omit(merge({
            $schema:  'http://json-schema.org/draft-06/schema#',
            $id: '/schemas/common/test.json#',
          }, content), omitPaths),
        });
        return this;
      }

      apiref({omitPaths=[], filename='test-api-ref.yml', ...content}) {
        this.references.push({
          filename,
          content: omit(merge({
            $schema: '/schemas/common/api-reference-v0.json#',
            version: 0,
            apiVersion: 'v2',
            serviceName: 'test',
            baseUrl: 'http://test.localhost',
            title: 'Test Service',
            description: 'Test Service',
            entries: [],
          }, content), omitPaths),
        });
        return this;
      }

      end() {
        return new References(this);
      }
    }

    const assertProblems = (references, expected) => {
      try {
        references.validate();
      } catch (e) {
        if (!expected.length || !e.problems) {
          throw e;
        }
        assert.deepEqual(e.problems.sort(), expected.sort());
        return;
      }
      if (expected.length) {
        throw new Error('Expected problems not identified');
      }
    };

    test('empty references pass', function() {
      const references = new RefBuilder().end();
      assertProblems(references, []);
    });

    test('schema with no $id fails', function() {
      const references = new RefBuilder()
        .schema({omitPaths: ['$id']})
        .end();
      assertProblems(references, ['schema test-schema.yml has no $id']);
    });

    test('schema with invalid $id fails', function() {
      const references = new RefBuilder()
        .schema({$id: '/schemas/foo.yml'})
        .end();
      assertProblems(references, [
        'schema test-schema.yml has an invalid $id \'https://validate-root.example.com/schemas/foo.yml\' ' +
        '(expected \'/schemas/<something>/something>.json#\'',
      ]);
    });

    test('schema with invalid absolute $ref fails', function() {
      const references = new RefBuilder()
        .schema({
          type: 'object',
          properties: {
            foo: {$ref: 'https://example.com/schema.json#'},
          },
        })
        .end();
      assertProblems(references, [
        'schema test-schema.yml $ref at schema.properties.foo is not allowed',
      ]);
    });

    test('schema with invalid relative $ref fails', function() {
      const references = new RefBuilder()
        .schema({
          type: 'object',
          properties: {
            foo: {$ref: '../uncommon/foo.json#'},
          },
        })
        .end();
      assertProblems(references, [
        'schema test-schema.yml $ref at schema.properties.foo is not allowed',
      ]);
    });

    test('schema with no metaschema fails', function() {
      const references = new RefBuilder()
        .schema({omitPaths: ['$schema']})
        .end();
      assertProblems(references, ['schema test-schema.yml has no $schema']);
    });

    test('schema with custom metaschema passes', function() {
      const references = new RefBuilder()
        .schema({
          $schema: '/schemas/common/metadata-metaschema.json#',
          metadata: {name: 'api', version: 1},
        })
        .end();
      assertProblems(references, []);
    });

    test('invalid schema fails', function() {
      const references = new RefBuilder()
        .schema({
          type: 'object',
          properties: {
            abc: ['a'],
          },
        })
        .end();
      assertProblems(references, [
        'test-schema.yml: schema.properties[\'abc\'] should be object,boolean',
      ]);
    });

    test('invalid schema with custom metaschema passes', function() {
      const references = new RefBuilder()
        .schema({
          $schema: '/schemas/common/metadata-metaschema.json#',
          metadata: {version: 1},
        })
        .end();
      assertProblems(references, [
        'test-schema.yml: schema.metadata should have required property \'name\'',
      ]);
    });

    test('schema with undefined metaschema fails', function() {
      const references = new RefBuilder()
        .schema({$schema: '/schemas/nosuch.json#'})
        .end();
      assertProblems(references, [
        'schema test-schema.yml has invalid $schema (must be defined here or be on at json-schema.org)',
      ]);
    });

    test('reference with no $schema fails', function() {
      const references = new RefBuilder()
        .apiref({omitPaths: ['$schema']})
        .end();
      assertProblems(references, ['reference test-api-ref.yml has no $schema']);
    });

    test('invalid reference fails', function() {
      const references = new RefBuilder()
        .apiref({entries: true})
        .end();
      assertProblems(references, [
        'test-api-ref.yml: reference.entries should be array',
      ]);
    });

    test('reference with undefined $schema fails', function() {
      const references = new RefBuilder()
        .apiref({$schema: '/schemas/nosuch.json#'})
        .end();
      assertProblems(references, [
        'reference test-api-ref.yml has invalid $schema (must be defined here)',
      ]);
    });

    test('reference with non-metadata metaschema fails', function() {
      const references = new RefBuilder()
        .apiref({$schema: '/schemas/common/metadata-metaschema.json#'})
        .end();
      assertProblems(references, [
        'reference test-api-ref.yml has schema ' +
        '\'https://validate-root.example.com/schemas/common/metadata-metaschema.json#\' ' +
        'which does not have the metadata metaschema',
      ]);
    });
  });
});
