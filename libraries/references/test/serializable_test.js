import assert from 'assert';
import References from '../src/index.js';
import { makeSerializable } from '../src/serializable.js';
import { getCommonSchemas } from '../src/common-schemas.js';
import libUrls from 'taskcluster-lib-urls';
import testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  const rootUrl = libUrls.testRootUrl();

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

  const getReferences = async () => new References({
    schemas: await getCommonSchemas(),
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

  test('generates an abstract manifest', async function() {
    const references = await getReferences();
    const serializable = makeSerializable({ references });
    assert_file(serializable, 'references/manifest.json', {
      $schema: '/schemas/common/manifest-v3.json#',
      references: [
        '/references/test/v1/api.json',
        '/references/test2/v2/exchanges.json',
      ],
    });
  });

  test('generates an absolute manifest', async function() {
    const references = await getReferences();
    const serializable = makeSerializable({ references: references.asAbsolute(rootUrl) });
    assert_file(serializable, 'references/manifest.json', {
      $schema: rootUrl + '/schemas/common/manifest-v3.json#',
      references: [
        rootUrl + '/references/test/v1/api.json',
        rootUrl + '/references/test2/v2/exchanges.json',
      ],
    });
  });

  test('generates abstract schema filenames', async function() {
    const references = await getReferences();
    const serializable = makeSerializable({ references });
    assert_file(serializable, 'schemas/common/api-reference-v0.json', content => {
      assert.equal(content.$schema, '/schemas/common/metadata-metaschema.json#');
      assert.equal(content.$id, '/schemas/common/api-reference-v0.json#');
    });
  });

  test('generates absolute schema filenames', async function() {
    const references = await getReferences();
    const serializable = makeSerializable({ references: references.asAbsolute(rootUrl) });
    assert_file(serializable, 'schemas/common/api-reference-v0.json', content => {
      assert.equal(content.$schema, rootUrl + '/schemas/common/metadata-metaschema.json#');
      assert.equal(content.$id, rootUrl + '/schemas/common/api-reference-v0.json#');
    });
  });

  test('generates an API reference filename', async function() {
    const references = await getReferences();
    const serializable = makeSerializable({ references });
    assert_file(serializable, 'references/test/v1/api.json', {
      $schema: '/schemas/common/api-reference-v0.json#',
      title: 'test',
      description: 'test',
      serviceName: 'test',
      apiVersion: 'v1',
      entries: [],
    });
  });

  test('generates an exchanges reference filename', async function() {
    const references = await getReferences();
    const serializable = makeSerializable({ references });
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
    References.fromSerializable({
      serializable: [{
        filename: 'schemas/common/foo.json',
        content: {
          $id: '/schemas/common/foo.json#',
        },
      }],
    });
  });
});
