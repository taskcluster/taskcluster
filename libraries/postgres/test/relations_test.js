import Relations from '../src/Relations.js';
import path from 'node:path';
import { strict as assert } from 'node:assert';

const __filename = new URL('', import.meta.url).pathname;

suite(path.basename(__filename), () => {
  suite('checking', () => {
    test('not an object', () => {
      assert.throws(
        () => Relations._check([], 'f'),
        /should define an object/);
    });
    test('not an object of objects', () => {
      assert.throws(
        () => Relations.fromSerializable({ test: [] }, 'f'),
        /should define an object/);
    });
    test('table column values are not strings', () => {
      assert.throws(
        () => Relations.fromSerializable({ test: { name: [] } }),
        /should be a string/);
    });
  });
});
