const _ = require('lodash');
const assert = require('assert').strict;
const { paginateResults } = require('../');
const testing = require('taskcluster-lib-testing');
const Hashids = require('hashids/cjs');

suite(testing.suiteName(), function() {
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
