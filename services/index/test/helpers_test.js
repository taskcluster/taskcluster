const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const helpers = require('../src/helpers');

suite(testing.suiteName(), function() {
  suite('splitNamespace', function() {
    test('of a multi-part namespace', function() {
      const [namespace, name] = helpers.splitNamespace('foo.bar.bing');
      assert.equal(namespace, 'foo.bar');
      assert.equal(name, 'bing');
    });

    test('of a two-part namespace', function() {
      const [namespace, name] = helpers.splitNamespace('foo.bar');
      assert.equal(namespace, 'foo');
      assert.equal(name, 'bar');
    });

    test('of a single-part namespace', function() {
      const [namespace, name] = helpers.splitNamespace('foo');
      assert.equal(namespace, '');
      assert.equal(name, 'foo');
    });

    test('of an empty namespace', function() {
      const [namespace, name] = helpers.splitNamespace('');
      assert.equal(namespace, '');
      assert.equal(name, '');
    });
  });
});
