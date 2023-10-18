import Relations from '../src/Relations.js';
import path from 'path';
import { strict as assert } from 'assert';

const __filename = new URL('', import.meta.url).pathname;

suite(path.basename(__filename), function() {
  suite('checking', function() {
    test('not an object', function() {
      assert.throws(
        () => Relations._check([], 'f'),
        /should define an object/);
    });
    test('not an object of objects', function() {
      assert.throws(
        () => Relations.fromSerializable({ test: [] }, 'f'),
        /should define an object/);
    });
    test('table column values are not strings', function() {
      assert.throws(
        () => Relations.fromSerializable({ test: { name: [] } }),
        /should be a string/);
    });
  });
});
