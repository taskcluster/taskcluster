import assert from 'assert';
import SchemaSet from '../src/index.js';
import _ from 'lodash';
import libUrls from 'taskcluster-lib-urls';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  const rootUrl = libUrls.testRootUrl();

  const makeSchemaSet = () => {
    return new SchemaSet({
      folder: 'test/schemas',
      serviceName: 'whatever',
      constants: { 'my-constant': 42 },
    });
  };

  test('abstract schemas available', () => {
    let schemas = makeSchemaSet().abstractSchemas();
    assert.equal(_.keys(schemas).length, 9);
    assert(_.includes(_.keys(schemas), 'v1/default-schema.json'));
    assert.equal(
      schemas['v1/default-schema.json'].$id,
      '/schemas/whatever/v1/default-schema.json#',
    );
  });

  test('absolute schemas available', () => {
    let schemas = makeSchemaSet().absoluteSchemas(rootUrl);
    assert.equal(_.keys(schemas).length, 9);
    assert(_.includes(_.keys(schemas), 'v1/default-schema.json'));
    assert.equal(
      schemas['v1/default-schema.json'].$id,
      'https://tc-tests.example.com/schemas/whatever/v1/default-schema.json#',
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
});
