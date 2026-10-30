import assert from 'node:assert';
import fs from 'node:fs';
import { getCommonSchemas } from '../src/common-schemas.js';
import { makeSerializable } from '../src/serializable.js';
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

  const getReferences = async () => {
    return new References({
      schemas: await getCommonSchemas(),
      references: [],
    });
  };

  test('getSchema', async () => {
    assert.equal(
      (await getReferences()).getSchema('/schemas/common/manifest-v3.json#').$id,
      '/schemas/common/manifest-v3.json#'
    );
  });

  test('fromService', async () => {
    // mock SchemaSet from @taskcluster/lib-validate
    const schemaset = {
      abstractSchemas() {
        return {
          'somefile.json': {
            $id: 'somefile.json#',
          },
        };
      },
    };

    const references = await References.fromService({
      schemaset,
      references: [
        {
          $schema: '/schemas/common/v1/api-reference.json#',
          serviceName: 'testy',
          apiVersion: 'v2',
        },
      ],
    });
    assert(references.references.some(r => r.content.serviceName === 'testy'));
    assert(references.schemas.some(s => s.content.$id === 'somefile.json#'));
  });

  test('makeSerializable', async () => {
    const references = await getReferences();
    assert.deepEqual(references.makeSerializable(), makeSerializable({ references }));
  });

  test('writes uri-structured', async () => {
    tmpDir = await makeTmpTree();
    const references = new References({
      references: [
        {
          filename: 'some-reference.yml',
          content: {
            $schema: '/schemas/common/api-reference-v0.json#',
            apiVersion: 'v2',
            serviceName: 'test',
            title: 'Test Service',
            description: 'Test Service',
            entries: [
              {
                type: 'function',
                name: 'foo',
                title: 'Foo',
                description: 'Foo-bar',
                category: 'Foo',
                method: 'get',
                input: 'sch.json#',
                route: '/foo',
                args: [],
                stability: 'experimental',
              },
            ],
          },
        },
      ],
      schemas: (await getCommonSchemas()).concat([
        {
          filename: 'foo.json',
          content: {
            $schema: '/schemas/common/metaschema.json#',
            $id: '/schemas/test/sch.json#',
            metadata: { name: 'api', version: 1 },
            type: 'string',
          },
        },
      ]),
    });

    const refdata = path.join(tmpDir, 'refdata');
    await references.writeUriStructured({ directory: refdata });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(refdata, 'schemas/test/sch.json'))), {
      $id: '/schemas/test/sch.json#',
      $schema: '/schemas/common/metaschema.json#',
      metadata: { name: 'api', version: 1 },
      type: 'string',
    });
  });

  test('empty references pass validation', () => {
    const references = new References({ references: [], schemas: [] });
    references.validate();
  });

  test('bogus references fail validation', () => {
    const references = new References({ references: [], schemas: [{ filename: 'bogus.json', content: {} }] });
    assert.throws(() => references.validate(), 'no $id');
  });
});
