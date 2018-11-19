const assert = require('assert');
const {getCommonSchemas} = require('../src/common-schemas');

suite('common-schemas_test.js', function() {
  test('loads common schemas', function() {
    const schemas = getCommonSchemas();
    assert(schemas.some(
      ({content, filename}) => content.$id === '/schemas/common/api-reference-v0.json#'));
    assert(schemas.some(
      ({content, filename}) => filename  === 'schemas/metadata-metaschema.yml'));
  });
});
