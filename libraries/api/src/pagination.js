const assert = require('assert');
const Hashids = require('hashids/cjs');

exports.paginateResults = async ({ query, fetch, indexColumns, maxLimit = 1000 }) => {
  assert(query, "req.query must be provided");
  assert(fetch, "fetch function must be provided");

  const { continuationToken, limit } = query;
  const pageSize = Math.min(parseInt(limit || maxLimit, 10), maxLimit);

  if (indexColumns) {
    // index-based pagination
    const after = decodeAfter(indexColumns, continuationToken);

    const rows = await fetch(pageSize + 1, after);

    const response = { rows };
    // if we got more than pageSize rows, due to the +1 above, then there are
    // more rows to fetch, so generate a continuationToken
    if (rows.length > pageSize) {
      response.rows.splice(-1);
      response.continuationToken = encodeAfter(indexColumns, rows[rows.length - 1]);
    }

    return response;
  } else {
    // offset/limit-based pagination
    const pageOffset = decodeOffset(continuationToken);

    // fetch one additional row so that we can tell if there's more data
    // and we need to return a continuationToken
    const rows = await fetch(pageSize + 1, pageOffset);

    const response = { rows };
    // if we got more than pageSize rows, due to the +1 above, then there are
    // more rows to fetch..
    if (rows.length > pageSize) {
      response.rows.splice(-1);
      response.continuationToken = encodeOffset(pageOffset + pageSize);
    }

    return response;
  }
};

exports.paginateResults.query = {
  continuationToken: /./,
  limit: /^[0-9]+$/,
};

const hashids = new Hashids('salt', 10);

const decodeAfter = (indexColumns, token) => {
  // SECURITY NOTE: it's important that the parameter names (after_.._in) not
  // be based on user input, as those are substituted into raw SQL commands.
  if (token) {
    try {
      const json = Buffer.from(token, 'base64');
      const data = JSON.parse(json);
      assert(Array.isArray(data) && data.length === indexColumns.length);
      return Object.fromEntries(indexColumns.map((col, i) => [`after_${col}_in`, data[i]]));
    } catch (_) {
      // fall through to the default
    }
  }

  // default to the "start at the beginning" value
  return Object.fromEntries(indexColumns.map(col => [`after_${col}_in`, null]));
};

const encodeAfter = (indexColumns, row) => {
  // a base64-encoded JSON array, just to discourage users from treating
  // continuation tokens as an open query API
  const data = indexColumns.map(col => row[col]);
  return Buffer.from(JSON.stringify(data)).toString('base64');
};

const decodeOffset = token => {
  const decodedToken = hashids.decode(token);

  if (!decodedToken.length) {
    return 0;
  }

  return decodedToken[0];
};

const encodeOffset = pageOffset => {
  if (!pageOffset) {
    return null;
  }

  return hashids.encode(pageOffset);
};
