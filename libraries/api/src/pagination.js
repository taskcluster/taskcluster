import assert from 'assert';
import Hashids from 'hashids';
import { ErrorReply } from './error-reply.js';

/**
 * @typedef PaginateResultsResponse
 * @property {Array<any>} rows
 * @property {string?} [continuationToken]
 *
 * @param {Object} options
 * @param {{ continuationToken?: string, limit?: string }} options.query
 * @param {Function} options.fetch - Function to fetch rows of data.
 * @param {string[]} [options.indexColumns] - Column names to use for index-based pagination.
 * @param {number} [options.maxLimit=1000] - Maximum number of results to return per request.
 * @returns {Promise<PaginateResultsResponse>} Paginated results.
 */
export const paginateResults = async ({ query, fetch, indexColumns, maxLimit = 1000 }) => {
  assert(query, "req.query must be provided");
  assert(fetch, "fetch function must be provided");

  const { continuationToken, limit } = query;
  const pageSize = Math.min(parseInt(limit || String(maxLimit), 10), maxLimit);

  if (indexColumns) {
    // index-based pagination
    const after = decodeAfter(indexColumns, continuationToken);

    const rows = await fetch(pageSize + 1, after);

    /** @type {PaginateResultsResponse} */
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

    /** @type {PaginateResultsResponse} */
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

paginateResults.query = {
  continuationToken: /./,
  limit: /^[0-9]+$/,
};

const hashids = new Hashids('salt', 10);

/**
 * @param {string[]} indexColumns - Column names to use for index-based pagination.
 * @param {string|undefined} token - The continuation token to decode
 * @returns {Record<string, any>} Object containing "after_*_in" keys mapped to values
 */
const decodeAfter = (indexColumns, token) => {
  // SECURITY NOTE: it's important that the parameter names (after_.._in) not
  // be based on user input, as those are substituted into raw SQL commands.
  if (token) {
    try {
      const json = Buffer.from(token, 'base64').toString('utf-8');
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

/**
 * @param {string[]} indexColumns - Column names to use for index-based pagination
 * @param {Record<string, any>} row - Row containing values to encode
 * @returns {string} Base64 encoded continuation token
 */
const encodeAfter = (indexColumns, row) => {
  // a base64-encoded JSON array, just to discourage users from treating
  // continuation tokens as an open query API
  const data = indexColumns.map(col => row[col]);
  return Buffer.from(JSON.stringify(data)).toString('base64');
};

/**
 * Decode continuation token into a numeric offset
 * @param {string|undefined} token - The continuation token to decode
 * @returns {number} The decoded offset value
 * @throws {ErrorReply} If token is invalid
 */
const decodeOffset = token => {
  let decodedToken;

  if (!token) {
    return 0;
  }

  try {
    decodedToken = hashids.decode(token);
  } catch (err) {
    // hashids.decode will throw an error if token contains invalid characters
    // this will return 400 to the client
    throw new ErrorReply({
      code: 'InputError',
      message: 'Invalid continuation token',
      details: { token, error: err.message },
    });
  }

  if (!decodedToken.length) {
    return 0;
  }

  return Number(decodedToken[0]);
};

/**
 * Encode page offset into a continuation token
 * @param {number} pageOffset - The page offset to encode
 * @returns {string|null} The encoded continuation token, or null if no offset
 */
const encodeOffset = pageOffset => {
  if (!pageOffset) {
    return null;
  }

  return hashids.encode(pageOffset);
};
