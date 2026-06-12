import assert from 'node:assert';
import { cleanupDescription } from '../src/util.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  test('empty string', () => {
    assert.equal(cleanupDescription(''), '');
  });

  test('one-line string', () => {
    assert.equal(cleanupDescription('hello'), 'hello');
  });

  test('two-line string with no indentation', () => {
    assert.equal(cleanupDescription('hello\nworld'), 'hello\nworld');
  });

  test('two-line string with all but first indented', () => {
    assert.equal(cleanupDescription(
      `hello
      world`),
    'hello\nworld');
  });

  test('two-line string with all lines indented', () => {
    assert.equal(cleanupDescription(
      `
      hello
      world`),
    'hello\nworld');
  });
});
