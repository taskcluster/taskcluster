const { range } = require('lodash');
const _ = require('lodash');
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
    suite('offset/limit', function() {
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

    suite('index-based', function() {
      const indexColumns = ['a', 'b'];
      const data = (A, B) => _.range(0, A).flatMap(a => _.range(0, B).map(b => ({ a, b })));
      let calls;
      const fetcher = (A, B, maxSize) => {
        return async (size, after) => {
          calls.push([size, after]);
          if (maxSize) {
            size = Math.min(size, maxSize);
          }
          const filtered = data(A, B)
            .filter(({ a, b }) =>
              after.after_a_in === null ||
              a > after.after_a_in || (a === after.after_a_in && b > after.after_b_in));
          return filtered.slice(0, size);
        };
      };

      test('iterate in a few batches', async function() {
        calls = [];
        const got = [];
        for await (let v of paginatedIterator({
          indexColumns,
          fetch: fetcher(20, 11),
          size: 13,
        })) {
          got.push(v);
        }

        assert.deepEqual(got, data(20, 11));
        assert.deepEqual(calls, [
          [13, { after_a_in: null, after_b_in: null }],
          [13, { after_a_in: 1, after_b_in: 1 }],
          [13, { after_a_in: 2, after_b_in: 3 }],
          [13, { after_a_in: 3, after_b_in: 5 }],
          [13, { after_a_in: 4, after_b_in: 7 }],
          [13, { after_a_in: 5, after_b_in: 9 }],
          [13, { after_a_in: 7, after_b_in: 0 }],
          [13, { after_a_in: 8, after_b_in: 2 }],
          [13, { after_a_in: 9, after_b_in: 4 }],
          [13, { after_a_in: 10, after_b_in: 6 }],
          [13, { after_a_in: 11, after_b_in: 8 }],
          [13, { after_a_in: 12, after_b_in: 10 }],
          [13, { after_a_in: 14, after_b_in: 1 }],
          [13, { after_a_in: 15, after_b_in: 3 }],
          [13, { after_a_in: 16, after_b_in: 5 }],
          [13, { after_a_in: 17, after_b_in: 7 }],
          [13, { after_a_in: 18, after_b_in: 9 }],
          [13, { after_a_in: 19, after_b_in: 10 }],
        ]);
      });

      test('batch size smaller than requested', async function() {
        const got = [];
        for await (let v of paginatedIterator({
          indexColumns,
          fetch: fetcher(20, 12, 15),
          size: 130,
        })) {
          got.push(v);
        }

        assert.deepEqual(got, data(20, 12));
      });

      test('fetch fails', async function() {
        assert.rejects(async () => {
          for await (let _ of paginatedIterator({
            indexColumns,
            fetch: async () => { throw new Error('uhoh'); },
          })) {
            assert(false); // never gets here..
          }
        }, /uhoh/);
      });
    });
  });
});
