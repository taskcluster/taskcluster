const assert = require('assert');
const {defaultMonitorManager} = require('../src');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  suite('cleanupDescription', function() {
    test('empty string', function() {
      assert.equal(defaultMonitorManager.cleanupDescription(''), '');
    });

    test('one-line string', function() {
      assert.equal(defaultMonitorManager.cleanupDescription('hello'), 'hello');
    });

    test('two-line string with no indentation', function() {
      assert.equal(defaultMonitorManager.cleanupDescription('hello\nworld'), 'hello\nworld');
    });

    test('two-line string with all but first indented', function() {
      assert.equal(defaultMonitorManager.cleanupDescription(
        `hello
        world`),
      'hello\nworld');
    });

    test('two-line string with all lines indented', function() {
      assert.equal(defaultMonitorManager.cleanupDescription(
        `
        hello
        world`),
      'hello\nworld');
    });
  });
});
