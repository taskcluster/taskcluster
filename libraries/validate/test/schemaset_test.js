const assert = require('assert');
const SchemaSet = require('../');
const _ = require('lodash');
const libUrls = require('taskcluster-lib-urls');

suite('schemaset_test.js', () => {
  const rootUrl = libUrls.testRootUrl();

  const makeSchemaSet = () => {
    return new SchemaSet({
      folder: 'test/schemas',
      serviceName: 'whatever',
      constants: {'my-constant': 42},
    });
  };

  test('abstract schemas available', () => {
    let schemas = makeSchemaSet().abstractSchemas();
    assert.equal(_.keys(schemas).length, 9);
    assert(_.includes(_.keys(schemas), 'v1/default-schema.json'));
    assert.equal(
      schemas['v1/default-schema.json'].$id,
      'taskcluster:/schemas/whatever/v1/default-schema.json#'
    );
  });

  test('absolute schemas available', () => {
    let schemas = makeSchemaSet().absoluteSchemas(rootUrl);
    assert.equal(_.keys(schemas).length, 9);
    assert(_.includes(_.keys(schemas), 'v1/default-schema.json'));
    assert.equal(
      schemas['v1/default-schema.json'].$id,
      'https://tc-tests.localhost/schemas/whatever/v1/default-schema.json#'
    );
  });

  test('invalid schema containing an $id throws error', async () => {
    try {
      new SchemaSet({
        folder: 'test/invalid-schemas/schema-with-id',
        serviceName: 'whatever',
      });
      assert(false, 'Bad schema should\'ve thrown an exception!');
    } catch (e) {
      if (!e.toString().match(/attempts to set own id/)) {
        throw e;
      }
    }
  });

  test('invalid schema containing a default for an array throws error', async () => {
    try {
      new SchemaSet({
        folder: 'test/invalid-schemas/default-array-obj',
        serviceName: 'whatever',
      });
      assert(false, 'Bad schema should\'ve thrown an exception!');
    } catch (e) {
      if (!e.toString().match(/While loading default-array-obj-schema.json: schema is invalid:/)) {
        throw e;
      }
    }
  });
});
