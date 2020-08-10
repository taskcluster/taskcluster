const assert = require('assert');
const Hashids = require('hashids/cjs');

exports.paginateResults = async ({ query, fetch, maxLimit = 1000 }) => {
  assert(query, "req.query must be provided");
  assert(fetch, "fetch function must be provided");

  const { continuationToken, limit } = query;
  const pageSize = Math.min(parseInt(limit || maxLimit, 10), maxLimit);
  const pageOffset = decodeContinuationToken(continuationToken);

  // fetch one additional row so that we can tell if there's more data
  // and we need to return a continuationToken
  const rows = await fetch(pageSize + 1, pageOffset);

  const response = { rows };
  // if we got more than pageSize rows, due to the +1 above, then there are
  // more rows to fetch..
  if (rows.length > pageSize) {
    response.continuationToken = encodeContinuationToken(pageOffset + pageSize);
    response.rows.splice(-1);
  }

  return response;
};

exports.paginateResults.query = {
  continuationToken: /./,
  limit: /^[0-9]+$/,
};

const hashids = new Hashids('salt', 10);

const decodeContinuationToken = token => {
  const decodedToken = hashids.decode(token);

  if (!decodedToken.length) {
    return 0;
  }

  return decodedToken[0];
};

const encodeContinuationToken = pageOffset => {
  if (!pageOffset) {
    return null;
  }

  return hashids.encode(pageOffset);
};
