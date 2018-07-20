const fs = require('fs');
const assert = require('assert');
const {update, updateReferences, addCommonSchemas, updateSchemas} = require('../src/update');
const libUrls = require('taskcluster-lib-urls');

suite('updating', function() {
  const refTest = (description, input, output) => {
    test(description, function() {
      const data = {references: [input], schemas: []};
      updateReferences([input], libUrls.testRootUrl());
      assert.deepEqual(input, output);
    });
  };

  const apiSchema = 'https://tc-tests.localhost/schemas/common/api-reference-v0.json#';
  const exchangeSchema = 'https://tc-tests.localhost/schemas/common/exchanges-reference-v0.json#';

  refTest('updates a modern reference without change',
    {serviceName: 'fake', version: 'v1'},
    {serviceName: 'fake', version: 'v1', $schema: apiSchema});

  refTest('updates a reference with .name',
    {name: 'fake', version: 'v1'},
    {serviceName: 'fake', version: 'v1', $schema: apiSchema});

  refTest('updates a reference with .baseUrl',
    {baseUrl: 'https://fake.taskcluster.net/v1', version: 'v1'},
    {serviceName: 'fake', version: 'v1', $schema: apiSchema});

  refTest('updates a reference with .exchangePrefix (and does not delete it)', {
    exchangePrefix: 'exchange/taskcluster-fake/v1',
    version: 'v1',
  }, {
    exchangePrefix: 'exchange/taskcluster-fake/v1',
    serviceName: 'fake',
    version: 'v1',
    $schema: exchangeSchema,
  });

  refTest('guesses at a missing version',
    {baseUrl: 'https://fake.taskcluster.net/v1'},
    {serviceName: 'fake', version: 'v1', $schema: apiSchema});

  const schemaTest = (description, input, output) => {
    test(description, async function() {
      updateSchemas([input], libUrls.testRootUrl());
      assert.deepEqual(input, output);
    });
  };

  schemaTest('relativizes a schema with $id',
    {$id: 'taskcluster:/schemas/fake/v1/fake-data.json#'},
    {$id: libUrls.schema(libUrls.testRootUrl(), 'fake', 'v1/fake-data.json#')});

  schemaTest('relativizes rootUrl=https://taskcluster.net schemas correctly',
    {$id: 'https://schemas.taskcluster.net/fake/v1/fake-data.json#'},
    {$id: libUrls.schema(libUrls.testRootUrl(), 'fake', 'v1/fake-data.json#')});

  schemaTest('adds # to $id',
    {$id: 'taskcluster:/schemas/fake/v1/fake-data.json'},
    {$id: libUrls.schema(libUrls.testRootUrl(), 'fake', 'v1/fake-data.json#')});

  schemaTest('moves id to $id',
    {id: 'taskcluster:/schemas/fake/v1/fake-data.json#'},
    {$id: libUrls.schema(libUrls.testRootUrl(), 'fake', 'v1/fake-data.json#')});

  test('adds common schemas', async function() {
    const schemas = [];
    await addCommonSchemas(schemas);
    const ids = schemas.map(sch => sch.$id).sort();
    assert.deepEqual(ids, [
      'taskcluster:/schemas/common/action-schema-v1.json#',
      'taskcluster:/schemas/common/api-reference-v0.json#',
      'taskcluster:/schemas/common/exchanges-reference-v0.json#',
      'taskcluster:/schemas/common/manifest-v2.json#',
    ]);
  });
});

