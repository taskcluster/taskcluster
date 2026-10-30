import fs from 'node:fs/promises';
import assert from 'node:assert';
import References from '../src/index.js';
import { readUriStructured, writeUriStructured } from '../src/uri-structured.js';
import path from 'node:path';
import testing from '@taskcluster/lib-testing';
import { makeTmpTree, removeTmpTree } from './helpers.js';

suite(testing.suiteName(), () => {
  let tmpDir;

  teardown(async () => {
    await removeTmpTree(tmpDir);
    tmpDir = undefined;
  });

  test('writes files', async () => {
    // write some data to check later that it's deleted
    tmpDir = await makeTmpTree({ 'refdata/foo': 'bar' });
    const refdata = path.join(tmpDir, 'refdata');

    await writeUriStructured({
      directory: refdata,
      serializable: [
        { filename: 'abc/def.json', content: { abc: 'def' } },
        { filename: 'abc.json', content: 'abc' },
      ],
    });

    try {
      await fs.access(path.join(refdata, 'foo'), fs.constants.F_OK);
      assert.fail('foo should have been deleted');
    } catch (e) {
      assert.equal(e.code, 'ENOENT');
    }
    assert.equal(await fs.readFile(path.join(refdata, 'abc/def.json')), '{\n  "abc": "def"\n}');
    assert.equal(await fs.readFile(path.join(refdata, 'abc.json')), '"abc"');
  });

  test('reads files', async () => {
    tmpDir = await makeTmpTree({
      'schemas/common/foo.json': '{"foo": "true"}',
      'references/something/bar.json': '{"bar": "true"}',
    });
    const files = await readUriStructured({ directory: tmpDir });
    assert.deepEqual(files.sort(), [
      {
        filename: 'references/something/bar.json',
        content: { bar: 'true' },
      },
      {
        filename: 'schemas/common/foo.json',
        content: { foo: 'true' },
      },
    ]);
  });

  test('fromUriStructured', async () => {
    tmpDir = await makeTmpTree({
      'schemas/common/foo.json':
        '{"foo": "true", "$id": "/schemas/common/foo.json", "$schema": "http://json-schema.org/draft-06/schema#"}',
      'references/something/bar.json': '{"bar": "true", "$schema": "/schemas/common/foo.json#"}',
    });
    const references = await References.fromUriStructured({ directory: tmpDir });
    assert.deepEqual(references.references, [
      {
        filename: 'references/something/bar.json',
        content: {
          $schema: '/schemas/common/foo.json#',
          bar: 'true',
        },
      },
    ]);
    assert.deepEqual(references.schemas, [
      {
        filename: 'schemas/common/foo.json',
        content: {
          $id: '/schemas/common/foo.json',
          $schema: 'http://json-schema.org/draft-06/schema#',
          foo: 'true',
        },
      },
    ]);
  });
});
