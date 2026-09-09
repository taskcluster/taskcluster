import Access from '../src/Access.js';
import path from 'node:path';
import { strict as assert } from 'node:assert';

const __filename = new URL('', import.meta.url).pathname;

suite(path.basename(__filename), () => {
  suite('checking', () => {
    test('not an object', () => {
      assert.throws(() => Access.fromSerializable([]), /should define an object/);
    });
    test('not an object of objects', () => {
      assert.throws(() => Access.fromSerializable({ test: [] }), /should define an object/);
    });
    test('service has keys aside from tables', () => {
      assert.throws(() => Access.fromSerializable({ test: { views: [] } }), /should only have a 'tables' property/);
    });
    test('service tables is an array', () => {
      assert.throws(() => Access.fromSerializable({ test: { tables: [] } }), /should be an object/);
    });
    test('service tables has invalid mode', () => {
      assert.throws(() => Access.fromSerializable({ test: { tables: { test: 'admin' } } }), /should be read or write/);
    });
  });
});
