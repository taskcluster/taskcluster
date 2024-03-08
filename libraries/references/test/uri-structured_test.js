import fs from 'fs/promises';
import assert from 'assert';
import References from '../src/index.js';
import { readUriStructured, writeUriStructured } from '../src/uri-structured.js';
import mockFs from 'mock-fs';
import testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  teardown(function() {
    mockFs.restore();
  });

  test('writes files', async function() {
    mockFs({});

    // write some data to check later that it's deleted
    await fs.mkdir('/refdata');
    await fs.writeFile('/refdata/foo', 'bar');

    await writeUriStructured({
      directory: '/refdata',
      serializable: [
        { filename: 'abc/def.json', content: { abc: 'def' } },
        { filename: 'abc.json', content: 'abc' },
      ],
    });

    try {
      await fs.access('/refdata/foo', fs.constants.F_OK);
      assert.fail('foo should have been deleted');
    } catch (e) {
      assert.equal(e.code, 'ENOENT');
    }
    assert.equal(await fs.readFile('/refdata/abc/def.json'), '{\n  "abc": "def"\n}');
    assert.equal(await fs.readFile('/refdata/abc.json'), '"abc"');
  });

  test('reads files', async function() {
    mockFs({
      '/data/schemas/common/foo.json': '{"foo": "true"}',
      '/data/references/something/bar.json': '{"bar": "true"}',
    });
    const files = await readUriStructured({ directory: '/data' });
    assert.deepEqual(files.sort(), [{
      filename: 'references/something/bar.json',
      content: { bar: 'true' },
    }, {
      filename: 'schemas/common/foo.json',
      content: { foo: 'true' },
    }]);
  });

  test('fromUriStructured', async function() {
    mockFs({
      '/data/schemas/common/foo.json':
        '{"foo": "true", "$id": "/schemas/common/foo.json", "$schema": "http://json-schema.org/draft-06/schema#"}',
      '/data/references/something/bar.json':
        '{"bar": "true", "$schema": "/schemas/common/foo.json#"}',
    });
    const references = await References.fromUriStructured({ directory: '/data' });
    assert.deepEqual(references.references, [{
      filename: 'references/something/bar.json',
      content: {
        $schema: '/schemas/common/foo.json#',
        bar: 'true',
      },
    }]);
    assert.deepEqual(references.schemas, [{
      filename: 'schemas/common/foo.json',
      content: {
        $id: '/schemas/common/foo.json',
        $schema: 'http://json-schema.org/draft-06/schema#',
        foo: 'true',
      },
    }]);
  });
});
