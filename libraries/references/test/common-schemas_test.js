import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import { getCommonSchemas } from '../src/common-schemas.js';

suite(testing.suiteName(), function () {
  test('loads common schemas', async function () {
    const schemas = await getCommonSchemas();
    assert(schemas.some(({ content, filename }) => content.$id === '/schemas/common/api-reference-v0.json#'));
    assert(schemas.some(({ content, filename }) => filename === 'schemas/metadata-metaschema.yml'));
  });
});
