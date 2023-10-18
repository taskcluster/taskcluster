import fs from 'fs';
import assert from 'assert';
import References from '../src/index.js';
import { readUriStructured, writeUriStructured } from '../src/uri-structured.js';
import mockFs from 'mock-fs';
import testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  teardown(function() {
    mockFs.restore();
  });

  test('writes files', function() {
    mockFs({});

    // write some data to check later that it's deleted
    fs.mkdirSync('/refdata');
    fs.writeFileSync('/refdata/foo', 'bar');

    writeUriStructured({
      directory: '/refdata',
      serializable: [
        { filename: 'abc/def.json', content: { abc: 'def' } },
        { filename: 'abc.json', content: 'abc' },
      ],
    });

    assert(!fs.existsSync('/refdata/foo'));
    assert.equal(fs.readFileSync('/refdata/abc/def.json'), '{\n  "abc": "def"\n}');
    assert.equal(fs.readFileSync('/refdata/abc.json'), '"abc"');
  });

  test('reads files', function() {
    mockFs({
      '/data/schemas/common/foo.json': '{"foo": "true"}',
      '/data/references/something/bar.json': '{"bar": "true"}',
    });
    const files = readUriStructured({ directory: '/data' });
    assert.deepEqual(files.sort(), [{
      filename: 'references/something/bar.json',
      content: { bar: 'true' },
    }, {
      filename: 'schemas/common/foo.json',
      content: { foo: 'true' },
    }]);
  });

  test('fromUriStructured', function() {
    mockFs({
      '/data/schemas/common/foo.json':
        '{"foo": "true", "$id": "/schemas/common/foo.json", "$schema": "http://json-schema.org/draft-06/schema#"}',
      '/data/references/something/bar.json':
        '{"bar": "true", "$schema": "/schemas/common/foo.json#"}',
    });
    const references = References.fromUriStructured({ directory: '/data' });
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
