const { range } = require('lodash');
const { dollarQuote, paginatedIterator } = require('../src/util');
const assert = require('assert');
const path = require('path');

suite(path.basename(__filename), function() {
  suite('dollarQuote', function() {
    test('simple string', function() {
      assert.equal(dollarQuote('abcd'), '$$abcd$$');
    });

    test('string containing $$', function() {
      assert.equal(dollarQuote('pre $$abcd$$ post'), '$x$pre $$abcd$$ post$x$');
    });
  });

  suite('paginatedIterator', function() {
    test('iterate in a few batches', async function() {
      const calls = [];
      const fetch = async (size, offset) => {
        calls.push([size, offset]);
        return range(1000).slice(offset, offset + size);
      };

      const got = [];
      for await (let v of paginatedIterator({ fetch, size: 13 })) {
        got.push(v);
      }

      assert.deepEqual(got, range(1000));
      assert.deepEqual(calls, range(0, 1000, 13).map(i => [13, i]).concat([[13, 1000]]));
    });

    test('batch size smaller than requested', async function() {
      const fetch = async (size, offset) => {
        return range(1000).slice(offset, offset + 10);
      };

      const got = [];
      for await (let v of paginatedIterator({ fetch, size: 100 })) {
        got.push(v);
      }

      assert.deepEqual(got, range(1000));
    });

    test('fetch fails', async function() {
      const fetch = async (size, offset) => {
        if (offset > 300) {
          throw new Error('oh noes');
        }
        return range(1000).slice(offset, offset + 10);
      };

      assert.rejects(async () => {
        const got = [];
        for await (let v of paginatedIterator({ fetch, size: 100 })) {
          got.push(v);
        }
      }, /oh noes/);
    });
  });
});
