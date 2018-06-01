const fs = require('fs');
const assert = require('assert');
const {update} = require('../src/update');
const libUrls = require('taskcluster-lib-urls');

suite('updating', function() {
  const refTest = (description, input, output) => {
    test(description, function() {
      const data = {references: [input], schemas: []};
      update(data);
      assert.deepEqual(data.references, [output]);
    });
  };

  refTest('updates a modern reference without change',
    {serviceName: 'fake', version: 'v1'},
    {serviceName: 'fake', version: 'v1'});

  refTest('updates a reference with .name',
    {name: 'fake', version: 'v1'},
    {serviceName: 'fake', version: 'v1'});

  refTest('updates a reference with .baseUrl',
    {baseUrl: 'https://fake.taskcluster.net/v1', version: 'v1'},
    {serviceName: 'fake', version: 'v1'});

  refTest('updates a reference with .exchangePrefix (and does not delete it)',
    {exchangePrefix: 'exchange/taskcluster-fake/v1', version: 'v1'},
    {exchangePrefix: 'exchange/taskcluster-fake/v1', serviceName: 'fake', version: 'v1'});

  refTest('guesses at a missing version',
    {baseUrl: 'https://fake.taskcluster.net/v1'},
    {serviceName: 'fake', version: 'v1'});

  const schemaTest = (description, input, output) => {
    test(description, function() {
      const data = {references: [], schemas: [input], rootUrl: libUrls.testRootUrl()};
      update(data);
      assert.deepEqual(data.schemas, [output]);
    });
  };

  schemaTest('relativizes a schema with $id',
    {$id: 'taskcluster:/schemas/fake/v1/fake-data.json#'},
    {$id: libUrls.schema(libUrls.testRootUrl(), 'fake', 'v1/fake-data.json#')});

  schemaTest('adds # to $id',
    {$id: 'taskcluster:/schemas/fake/v1/fake-data.json'},
    {$id: libUrls.schema(libUrls.testRootUrl(), 'fake', 'v1/fake-data.json#')});

  schemaTest('moves id to $id',
    {id: 'taskcluster:/schemas/fake/v1/fake-data.json#'},
    {$id: libUrls.schema(libUrls.testRootUrl(), 'fake', 'v1/fake-data.json#')});
});

