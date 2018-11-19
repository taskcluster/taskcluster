const fs = require('fs');
const assert = require('assert');
const {load} = require('../src/built-services');
const mockFs = require('mock-fs');
const References = require('..');

suite('built-services_test.js', function() {
  teardown(function() {
    mockFs.restore();
  });

  test('fails on files in the input dir', function() {
    mockFs({'/test/input/some.data': 'junk'});
    assert.throws(
      () => load({directory: '/test/input'}),
      /some.data is not a directory/);
  });

  test('fails on dirs without metadata.json', function() {
    mockFs({'/test/input/svc': {}});
    assert.throws(
      () => load({directory: '/test/input'}),
      /no such file or directory .*metadata.json/);
  });

  test('fails on metadata.json with unknown version', function() {
    mockFs({'/test/input/svc/metadata.json': '{"version": 17}'});
    assert.throws(
      () => load({directory: '/test/input'}),
      /unrecognized metadata version/);
  });

  const setupFs = () => {
    mockFs({
      '/test/input/svc1/metadata.json': '{"version": 1}',
      '/test/input/svc1/references/api.json': '{"api": 1, "$schema": "/sch"}',
      '/test/input/svc1/references/events.json': '{"exchanges": 1, "$schema": "/sch"}',
      '/test/input/svc2/metadata.json': '{"version": 1, "$schema": "/sch"}',
      '/test/input/svc2/references/api.json': '{"api": 2, "$schema": "/sch"}',
      '/test/input/svc3/metadata.json': '{"version": 1}',
      '/test/input/svc3/references/exchanges.json': '{"exchanges": 3, "$schema": "/sch"}',
    });
  };

  test('reads references', function() {
    setupFs();
    const {references, schemas} = load({directory: '/test/input'});
    assert.deepEqual(references.map(ref => JSON.stringify(ref.content)).sort(), [
      '{"api":1,"$schema":"/sch"}',
      '{"api":2,"$schema":"/sch"}',
      '{"exchanges":1,"$schema":"/sch"}',
      '{"exchanges":3,"$schema":"/sch"}',
    ]);
    assert.deepEqual(schemas, []);
  });

  test('References.fromBuiltServices reads references and adds common', function() {
    setupFs();
    const references = References.fromBuiltServices({directory: '/test/input'});
    assert.deepEqual(references.references.map(ref => JSON.stringify(ref.content)).sort(), [
      '{"api":1,"$schema":"/sch"}',
      '{"api":2,"$schema":"/sch"}',
      '{"exchanges":1,"$schema":"/sch"}',
      '{"exchanges":3,"$schema":"/sch"}',
    ]);
    // check for one of the common schemas
    const ids = references.schemas.map(({content}) => content.$id).sort();
    assert(ids.some(id => id === '/schemas/common/manifest-v3.json#'));
  });

  test('reads schemas at all nesting levels', function() {
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
    const {references, schemas} = load({directory: '/test/input'});
    assert.deepEqual(references, []);
    assert.deepEqual(schemas.map(sch => JSON.stringify(sch.content)).sort(),
      ['"deeper"', '"root"', '"versioned"']);
  });
});
