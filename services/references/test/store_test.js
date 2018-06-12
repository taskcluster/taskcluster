const fs = require('fs');
const assert = require('assert');
const {store} = require('../src/store');
const mockFs = require('mock-fs');
const {assert_rejects} = require('./helper');

suite('storing output', function() {
  teardown(function() {
    mockFs.restore();
  });

  test('deletes and re-creates output', async function() {
    mockFs({
      '/test/output/junk': 'junk-data',
    });
    assert(fs.existsSync('/test/output/junk'));
    await store({references: [], schemas: [], output: '/test/output'});
    assert(fs.existsSync('/test/output'));
    assert(!fs.existsSync('/test/output/junk'));
  });

  test('writes references at the path given by serviceName/version, and detects exchanges.json', async function() {
    mockFs({});
    await store({
      references: [
        {serviceName: 'fake', version: 'v1'},
        {serviceName: 'fake', exchangePrefix: 'exchanges/taskcluster-fake/v2', version: 'v2'},
      ],
      schemas: [],
      output: '/test/output',
    });
    assert(fs.existsSync('/test/output/references/fake/v1/api.json'));
    assert(!fs.existsSync('/test/output/references/fake/v1/exchanges.json'));
    assert(!fs.existsSync('/test/output/references/fake/v2/api.json'));
    assert(fs.existsSync('/test/output/references/fake/v2/exchanges.json'));

    const ref1 = JSON.parse(fs.readFileSync('/test/output/references/fake/v1/api.json'));
    assert.deepEqual(ref1, {serviceName: 'fake', version: 'v1'});
    const ref2 = JSON.parse(fs.readFileSync('/test/output/references/fake/v2/exchanges.json'));
    assert.deepEqual(ref2, {serviceName: 'fake', exchangePrefix: 'exchanges/taskcluster-fake/v2', version: 'v2'});
    const manifest = JSON.parse(fs.readFileSync('/test/output/references/manifest.json'));
    assert.deepEqual(manifest, {
      services: [
        {
          serviceName: 'fake',
          apis: [
            {version: 'v1', reference: '/references/fake/v1/api.json'},
          ],
          pulse: [
            {version: 'v2', reference: '/references/fake/v2/exchanges.json'},
          ],
        },
      ],
    });
  });

  test('writes schemas at the path given by their $id (without #)', async function() {
    mockFs({});
    await store({
      references: [],
      schemas: [
        {$id: 'https://tc-tests.localhost/schemas/fake/v1/foo.json#'},
        {$id: 'https://tc-tests.localhost/schemas/fake/v2/bar.json#'},
      ],
      output: '/test/output',
    });

    assert(fs.existsSync('/test/output/schemas/fake/v1/foo.json'));
    assert(fs.existsSync('/test/output/schemas/fake/v2/bar.json'));

    const sch1 = JSON.parse(fs.readFileSync('/test/output/schemas/fake/v1/foo.json'));
    assert.deepEqual(sch1, {$id: 'https://tc-tests.localhost/schemas/fake/v1/foo.json#'});
    const sch2 = JSON.parse(fs.readFileSync('/test/output/schemas/fake/v2/bar.json'));
    assert.deepEqual(sch2, {$id: 'https://tc-tests.localhost/schemas/fake/v2/bar.json#'});
  });
});
