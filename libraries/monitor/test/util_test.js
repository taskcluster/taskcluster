const assert = require('assert');
const {cleanupDescription} = require('../src/util');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  test('empty string', function() {
    assert.equal(cleanupDescription(''), '');
  });

  test('one-line string', function() {
    assert.equal(cleanupDescription('hello'), 'hello');
  });

  test('two-line string with no indentation', function() {
    assert.equal(cleanupDescription('hello\nworld'), 'hello\nworld');
  });

  test('two-line string with all but first indented', function() {
    assert.equal(cleanupDescription(
      `hello
      world`),
    'hello\nworld');
  });

  test('two-line string with all lines indented', function() {
    assert.equal(cleanupDescription(
      `
      hello
      world`),
    'hello\nworld');
  });
});
