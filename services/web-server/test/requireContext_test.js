const assert = require('assert');
const path = require('path');
const testing = require('taskcluster-lib-testing');
const requireContext = require('../src/utils/requireContext');

suite(testing.suiteName(), () => {
  test('should be able to require a file', () => {
    const importer = requireContext('../src/utils');
    const result = importer.keys()
      .filter(key => key.endsWith('requireContext.js'))
      .map(key => importer(key));

    assert.equal(result.length, 1, 'should of had a file');
  });

  test('should be able to require a file with extension', () => {
    const importer = requireContext('../src/graphql', false, /\.graphql$/);
    const keys = importer.keys();

    assert(keys.length > 0, 'should of had files');

    keys.map(key => assert.equal(path.extname(key), '.graphql', 'should of had extension .graphql'));
  });

  test('should be able to require a file in a subdirectory', () => {
    const importer = requireContext('../', true, /\.graphql$/);
    const keys = importer.keys();

    assert(keys.length > 0, 'should of had files');
  });

  test('should throw an exception if the module does not exists', () => {
    assert.throws(function() {
      requireContext('./cat');
    }, /^Error: ENOENT/);
  });

  test('should be able to use importer.keys()', () => {
    const importer = requireContext('./');
    const basename = path.basename(__filename);
    const key = importer.keys().find(key => key === basename);

    assert.equal(key, basename, 'should of had been able to use importer.keys()');
  });

  test('should be able to use importer.keys() with loader', () => {
    const importer = requireContext('../src/utils');
    const key = importer.keys().find(key => key.endsWith('requireContext.js'));
    const result = importer(key);

    assert.equal(result, requireContext, 'should of had the same content');
  });
});
