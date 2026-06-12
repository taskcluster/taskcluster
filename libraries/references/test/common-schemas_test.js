import assert from 'node:assert';
import { getCommonSchemas } from '../src/common-schemas.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  test('loads common schemas', async () => {
    const schemas = await getCommonSchemas();
    assert(schemas.some(
      ({ content, filename }) => content.$id === '/schemas/common/api-reference-v0.json#'));
    assert(schemas.some(
      ({ content, filename }) => filename === 'schemas/metadata-metaschema.yml'));
  });
});
