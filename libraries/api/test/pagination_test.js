const _ = require('lodash');
const assert = require('assert').strict;
const { paginateResults } = require('../');
const testing = require('taskcluster-lib-testing');
const Hashids = require('hashids/cjs');

suite(testing.suiteName(), function() {
  suite('offset/limit', function() {
    const fetcher = n => async (size, offset) => _.range(offset, Math.min(n, offset + size));
    const hashids = new Hashids('salt', 10);

    test('paginate with limit higher than returned rows', async function() {
      assert.deepEqual(
        await paginateResults({ query: { limit: 10 }, fetch: fetcher(7) }),
        { rows: _.range(0, 7) });
    });

    test('paginate with limit equal to returned rows', async function() {
      assert.deepEqual(
        await paginateResults({ query: { limit: 7 }, fetch: fetcher(7) }),
        { rows: _.range(0, 7) }); // notably no continuationToken
    });

    test('paginate with limit less than returned rows', async function() {
      assert.deepEqual(
        await paginateResults({ query: { limit: 4 }, fetch: fetcher(7) }),
        { rows: _.range(0, 4), continuationToken: hashids.encode(4) });
    });

    test('paginate with continuationToken', async function() {
      const continuationToken = hashids.encode(5);
      assert.deepEqual(
        await paginateResults({ query: { limit: 100, continuationToken }, fetch: fetcher(7) }),
        { rows: _.range(5, 7) });
    });

    test('paginate with continuationToken and limit ending at returned rows', async function() {
      const continuationToken = hashids.encode(5);
      assert.deepEqual(
        await paginateResults({ query: { limit: 2, continuationToken }, fetch: fetcher(7) }),
        { rows: _.range(5, 7) });
    });

    test('paginate with continuationToken and limit returning another page', async function() {
      const continuationToken = hashids.encode(3);
      assert.deepEqual(
        await paginateResults({ query: { limit: 2, continuationToken }, fetch: fetcher(7) }),
        { rows: _.range(3, 5), continuationToken: hashids.encode(5) });
    });
  });

  suite('index-based', function() {
    const indexColumns = ['a', 'b'];
    const data = (A, B) => _.range(0, A).flatMap(a => _.range(0, B).map(b => ({ a, b })));
    const fetcher = (A, B) => {
      return async (size, after) => {
        const filtered = data(A, B)
          .filter(({ a, b }) =>
            after.after_a_in === null ||
            a > after.after_a_in || (a === after.after_a_in && b > after.after_b_in));
        return filtered.slice(0, size);
      };
    };

    const token = (a, b) => Buffer.from(JSON.stringify([a, b])).toString('base64');

    test('paginate with a limit higher than returned rows', async function() {
      assert.deepEqual(
        await paginateResults({ query: { limit: 110 }, indexColumns, fetch: fetcher(20, 5) }),
        { rows: data(20, 5).slice(0, 110) });
    });

    test('paginate with a limit equal to returned rows', async function() {
      assert.deepEqual(
        await paginateResults({ query: { limit: 100 }, indexColumns, fetch: fetcher(20, 5) }),
        { rows: data(20, 5) });
    });

    test('paginate with a limit one less than returned rows', async function() {
      assert.deepEqual(
        await paginateResults({ query: { limit: 99 }, indexColumns, fetch: fetcher(20, 5) }),
        { rows: data(20, 5).slice(0, 99), continuationToken: token(19, 3) });
      assert.deepEqual(
        await paginateResults({
          query: { limit: 99, continuationToken: token(19, 3) },
          indexColumns,
          fetch: fetcher(20, 5),
        }),
        { rows: data(20, 5).slice(99, 100) });
    });

    test('iterate over entire data set', async function() {
      let got = [];
      const query = { limit: 1 };
      while (true) {
        const { rows, continuationToken } = await paginateResults({ query, indexColumns, fetch: fetcher(10, 7) });
        got = got.concat(rows);
        if (continuationToken) {
          query.continuationToken = continuationToken;
        } else {
          break;
        }
      }
      assert.deepEqual(got, data(10, 7));
    });

    test('invalid base64 in token starts at first row', async function() {
      const continuationToken = '!@$%!@';
      assert.deepEqual(
        await paginateResults({ query: { limit: 1, continuationToken }, indexColumns, fetch: fetcher(5, 5) }),
        { rows: data(5, 5).slice(0, 1), continuationToken: token(0, 0) });
    });

    test('invalid JSON in token starts at first row', async function() {
      const continuationToken = Buffer.from('{"abc": 123').toString('base64');
      assert.deepEqual(
        await paginateResults({ query: { limit: 1, continuationToken }, indexColumns, fetch: fetcher(5, 5) }),
        { rows: data(5, 5).slice(0, 1), continuationToken: token(0, 0) });
    });

    test('non-array JSON in token starts at first row', async function() {
      const continuationToken = Buffer.from('{"abc": 123}').toString('base64');
      assert.deepEqual(
        await paginateResults({ query: { limit: 1, continuationToken }, indexColumns, fetch: fetcher(5, 5) }),
        { rows: data(5, 5).slice(0, 1), continuationToken: token(0, 0) });
    });

    test('bad-length array JSON in token starts at first row', async function() {
      const continuationToken = Buffer.from('[1, 2, 3]').toString('base64');
      assert.deepEqual(
        await paginateResults({ query: { limit: 1, continuationToken }, indexColumns, fetch: fetcher(5, 5) }),
        { rows: data(5, 5).slice(0, 1), continuationToken: token(0, 0) });
    });
  });
});
