const fs = require('fs');
const assert = require('assert');
const {load} = require('../src/load');
const mockFs = require('mock-fs');
const {assert_rejects} = require('./helper');

suite('loading input', function() {
  teardown(function() {
    mockFs.restore();
  });

  test('fails on files in the input dir', async function() {
    mockFs({'/test/input/some.data': 'junk'});
    await assert_rejects(
      load({input: '/test/input'}),
      /some.data is not a directory/);
  });

  test('fails on dirs without metadata.json', async function() {
    mockFs({'/test/input/svc': {}});
    await assert_rejects(
      load({input: '/test/input'}),
      /no such file or directory .*metadata.json/);
  });

  test('fails on metadata.json with unknown version', async function() {
    mockFs({'/test/input/svc/metadata.json': '{"version": 17}'});
    await assert_rejects(
      load({input: '/test/input'}),
      /unrecognized metadata version/);
  });

  test('reads references', async function() {
    mockFs({
      '/test/input/svc1/metadata.json': '{"version": 1}',
      '/test/input/svc1/references/api.json': '{"api": 1}',
      '/test/input/svc1/references/exchanges.json': '{"exchanges": 1}',
      '/test/input/svc2/metadata.json': '{"version": 1}',
      '/test/input/svc2/references/api.json': '{"api": 2}',
      '/test/input/svc3/metadata.json': '{"version": 1}',
      '/test/input/svc3/references/exchanges.json': '{"exchanges": 3}',
    });
    const {references, schemas} = await load({input: '/test/input'});
    assert.deepEqual(references.map(JSON.stringify).sort(),
      ['{"api":1}', '{"api":2}', '{"exchanges":1}', '{"exchanges":3}']);
    assert.deepEqual(schemas, []);
  });

  test('reads schemas at all nesting levels', async function() {
    mockFs({
      '/test/input/svc1/metadata.json': '{"version": 1}',
      '/test/input/svc1/schemas': {
        'root.json': '"root"',
        v1: {
          'versioned.json': '"versioned"',
        },
        v2: {
          deep: {
            dir: {
              'structure.json': '"deeper"',
            },
          },
        },
      },
    });
    const {references, schemas} = await load({input: '/test/input'});
    assert.deepEqual(references, []);
    assert.deepEqual(schemas.map(JSON.stringify).sort(),
      ['"deeper"', '"root"', '"versioned"']);
  });
});
