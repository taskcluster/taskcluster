import assert from 'node:assert';
import load from '../src/built-services.js';
import path from 'node:path';
import References from '../src/index.js';
import testing from '@taskcluster/lib-testing';
import { makeTmpTree, removeTmpTree } from './helpers.js';

suite(testing.suiteName(), () => {
  let tmpDir;

  teardown(async () => {
    await removeTmpTree(tmpDir);
    tmpDir = undefined;
  });

  test('fails on files in the input dir', async () => {
    tmpDir = await makeTmpTree({ 'some.data': 'junk' });

    try {
      await load({ directory: tmpDir });
      assert.equal('should have thrown', 'but did not');
    } catch (err) {
      assert.equal(err.message, `${path.join(tmpDir, 'some.data')} is not a directory`);
    }
  });

  const setupFs = async () => {
    tmpDir = await makeTmpTree({
      'svc1/metadata.json': '{"version": 1}',
      'svc1/references/api.json': '{"api": 1, "$schema": "/sch"}',
      'svc1/references/events.json': '{"exchanges": 1, "$schema": "/sch"}',
      'svc2/metadata.json': '{"version": 1, "$schema": "/sch"}',
      'svc2/references/api.json': '{"api": 2, "$schema": "/sch"}',
      'svc3/metadata.json': '{"version": 1}',
      'svc3/references/exchanges.json': '{"exchanges": 3, "$schema": "/sch"}',
    });
  };

  test('reads references', async () => {
    await setupFs();
    const { references, schemas } = await load({ directory: tmpDir });
    assert.deepEqual(references.map(ref => JSON.stringify(ref.content)).sort(), [
      '{"api":1,"$schema":"/sch"}',
      '{"api":2,"$schema":"/sch"}',
      '{"exchanges":1,"$schema":"/sch"}',
      '{"exchanges":3,"$schema":"/sch"}',
    ]);
    assert.deepEqual(schemas, []);
  });

  test('References.fromBuiltServices reads references and adds common', async () => {
    await setupFs();
    const references = await References.fromBuiltServices({ directory: tmpDir });
    assert.deepEqual(references.references.map(ref => JSON.stringify(ref.content)).sort(), [
      '{"api":1,"$schema":"/sch"}',
      '{"api":2,"$schema":"/sch"}',
      '{"exchanges":1,"$schema":"/sch"}',
      '{"exchanges":3,"$schema":"/sch"}',
    ]);
    // check for one of the common schemas
    const ids = references.schemas.map(({ content }) => content.$id).sort();
    assert(ids.some(id => id === '/schemas/common/manifest-v3.json#'));
  });

  test('reads schemas at all nesting levels', async () => {
    tmpDir = await makeTmpTree({
      'svc1/metadata.json': '{"version": 1}',
      'svc1/schemas': {
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
    const { references, schemas } = await load({ directory: tmpDir });
    assert.deepEqual(references, []);
    assert.deepEqual(schemas.map(sch => JSON.stringify(sch.content)).sort(), ['"deeper"', '"root"', '"versioned"']);
  });
});
