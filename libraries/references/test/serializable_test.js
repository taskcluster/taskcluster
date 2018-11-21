const assert = require('assert');
const References = require('..');
const {makeSerializable, fromSerializable} = require('../src/serializable');
const {getCommonSchemas} = require('../src/common-schemas');
const libUrls = require('taskcluster-lib-urls');

suite('serializable_test.js', function() {
  const rootUrl = libUrls.testRootUrl();
  const legacyRootUrl = 'https://taskcluster.net';

  const assert_file = (serializable, filename, content) => {
    for (let file of serializable) {
      if (file.filename !== filename) {
        continue;
      }
      if (typeof content === 'function') {
        content(file.content);
      } else {
        assert.deepEqual(file.content, content);
      }
      return;
    }
    throw new Error(`filename ${filename} not found`);
  };

  const references = new References({
    schemas: getCommonSchemas(),
    references: [{
      filename: 'test-ref.json',
      content: {
        $schema: '/schemas/common/api-reference-v0.json#',
        title: 'test',
        description: 'test',
        serviceName: 'test',
        apiVersion: 'v1',
        entries: [],
      },
    }, {
      filename: 'test2-ref.json',
      content: {
        $schema: '/schemas/common/exchanges-reference-v0.json#',
        serviceName: 'test2',
        apiVersion: 'v2',
        title: 'test',
        description: 'test',
        exchangePrefix: 'x',
        entries: [],
      },
    }],
  });

  const sortedBy = (array, prop) => {
    return array.map(({content}) => content).sort((a, b) => {
      if (a[prop] < b[prop]) {
        return -1;
      } else if (a[prop] > b[prop]) {
        return 1;
      } else {
        return 0;
      }
    });
  };

  test('generates an abstract manifest', function() {
    const serializable = makeSerializable({references});
    assert_file(serializable, 'references/manifest.json', {
      $schema: '/schemas/common/manifest-v3.json#',
      references: [
        '/references/test/v1/api.json',
        '/references/test2/v2/exchanges.json',
      ],
    });
  });

  test('generates an absolute manifest', function() {
    const serializable = makeSerializable({references: references.asAbsolute(rootUrl)});
    assert_file(serializable, 'references/manifest.json', {
      $schema: rootUrl + '/schemas/common/manifest-v3.json#',
      references: [
        rootUrl + '/references/test/v1/api.json',
        rootUrl + '/references/test2/v2/exchanges.json',
      ],
    });
  });

  test('generates an absolute manifest for legacy rootUrl', function() {
    const serializable = makeSerializable({references: references.asAbsolute(legacyRootUrl)});
    assert_file(serializable, 'references/manifest.json', {
      $schema: 'https://schemas.taskcluster.net/common/manifest-v3.json#',
      references: [
        'https://references.taskcluster.net/test/v1/api.json',
        'https://references.taskcluster.net/test2/v2/exchanges.json',
      ],
    });
  });

  test('generates abstract schema filenames', function() {
    const serializable = makeSerializable({references});
    assert_file(serializable, 'schemas/common/api-reference-v0.json', content => {
      assert.equal(content.$schema, '/schemas/common/metadata-metaschema.json#');
      assert.equal(content.$id, '/schemas/common/api-reference-v0.json#');
    });
  });

  test('generates absolute schema filenames', function() {
    const serializable = makeSerializable({references: references.asAbsolute(rootUrl)});
    assert_file(serializable, 'schemas/common/api-reference-v0.json', content => {
      assert.equal(content.$schema, rootUrl + '/schemas/common/metadata-metaschema.json#');
      assert.equal(content.$id, rootUrl + '/schemas/common/api-reference-v0.json#');
    });
  });

  test('generates absolute schema filenames for legacy rootUrl', function() {
    const serializable = makeSerializable({references: references.asAbsolute(legacyRootUrl)});
    assert_file(serializable, 'schemas/common/api-reference-v0.json', content => {
      assert.equal(content.$schema, 'https://schemas.taskcluster.net/common/metadata-metaschema.json#');
      assert.equal(content.$id, 'https://schemas.taskcluster.net/common/api-reference-v0.json#');
    });
  });

  test('generates an API reference filename', function() {
    const serializable = makeSerializable({references});
    assert_file(serializable, 'references/test/v1/api.json', {
      $schema: '/schemas/common/api-reference-v0.json#',
      title: 'test',
      description: 'test',
      serviceName: 'test',
      apiVersion: 'v1',
      entries: [],
    });
  });

  test('generates an exchanges reference filename', function() {
    const serializable = makeSerializable({references});
    assert_file(serializable, 'references/test2/v2/exchanges.json', {
      $schema: '/schemas/common/exchanges-reference-v0.json#',
      serviceName: 'test2',
      apiVersion: 'v2',
      title: 'test',
      description: 'test',
      exchangePrefix: 'x',
      entries: [],
    });
  });

  test('References.fromSerializable', function() {
    const unserialized = References.fromSerializable({
      serializable: [{
        filename: 'schemas/common/foo.json',
        content: {
          $id: '/schemas/common/foo.json#',
        },
      }],
    });
  });
});
