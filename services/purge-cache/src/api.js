const _ = require('lodash');
const debug = require('debug')('purge-cache');
const APIBuilder = require('taskcluster-lib-api');
const taskcluster = require('taskcluster-client');
const Entity = require('taskcluster-lib-entities');
const Hashids = require('hashids/cjs');
const { camelCase } = require('change-case');

// Common patterns URL parameters
const GENERIC_ID_PATTERN = /^[a-zA-Z0-9-_]{1,38}$/;

const camelCaseKeys = obj => {
  return Object.keys(obj).reduce((acc, curr) => {
    if (obj[curr] instanceof Date) {
      acc[camelCase(curr)] = obj[curr].toJSON();
    } else {
      acc[camelCase(curr)] = obj[curr];
    }

    return acc;
  }, {});
};

const decodeContinuationToken = token => {
  const hashids = new Hashids();
  const decodedToken = hashids.decode(token);

  if (!decodedToken.length) {
    return 0;
  }

  return decodedToken[0];
};

const encodeContinuationToken = token => {
  const hashids = new Hashids();

  if (!token) {
    return null;
  }

  return hashids.encode(token, 10);
};

const fetchResults = async (dbFn, queryKeys = {}, options = {}) => {
  const { continuation, limit} = options;
  const offset = decodeContinuationToken(continuation);
  const size = limit ? Math.min(limit, 1000) : 1000;

  const entries = await dbFn(size, offset);
  let hasNextPage;

  if (entries.length > size) {
    hasNextPage = true;
    // remove last element in place from list
    entries.splice(-1);
  } else {
    hasNextPage = false;
  }

  const contToken = hasNextPage ? offset + entries.length : null;

  return { entries, continuation: encodeContinuationToken(contToken) };
};

/** API end-point for version v1/ */
const builder = new APIBuilder({
  title: 'Purge Cache API',
  context: [
    'cfg', // A taskcluster-lib-config instance
    'cachePurgeCache', // An Promise for cacheing cachepurge responses
    'db',
  ],
  params: {
    provisionerId: GENERIC_ID_PATTERN,
    workerType: GENERIC_ID_PATTERN,
  },
  description: [
    'The purge-cache service is responsible for tracking cache-purge requests.',
    '',
    'User create purge requests for specific caches on specific workers, and',
    'these requests are timestamped.  Workers consult the service before',
    'starting a new task, and purge any caches older than the timestamp.',
  ].join('\n'),
  serviceName: 'purge-cache',
  apiVersion: 'v1',
});

// Export API
module.exports = builder;

/** Define tasks */
builder.declare({
  method: 'post',
  route: '/purge-cache/:provisionerId/:workerType',
  name: 'purgeCache',
  scopes: 'purge-cache:<provisionerId>/<workerType>:<cacheName>',
  input: 'purge-cache-request.yml',
  title: 'Purge Worker Cache',
  category: 'Purge-Cache Service',
  stability: APIBuilder.stability.stable,
  description: [
    'Publish a request to purge caches named `cacheName` with',
    'on `provisionerId`/`workerType` workers.',
    '',
    'If such a request already exists, its `before` timestamp is updated to',
    'the current time.',
  ].join('\n'),
}, async function(req, res) {
  let {provisionerId, workerType} = req.params;
  let {cacheName} = req.body;

  debug(`Processing request for ${provisionerId}/${workerType}/${cacheName}.`);

  await req.authorize({provisionerId, workerType, cacheName});
  await this.db.fns.purge_cache(provisionerId, workerType, cacheName, new Date(), taskcluster.fromNow('1 day'));

  // Return 204
  res.reply();
});

builder.declare({
  method: 'get',
  route: '/purge-cache/list',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'allPurgeRequests',
  output: 'all-purge-cache-request-list.yml',
  title: 'All Open Purge Requests',
  stability: APIBuilder.stability.stable,
  category: 'Purge-Cache Service',
  description: [
    'View all active purge requests.',
    '',
    'This is useful mostly for administors to view',
    'the set of open purge requests. It should not',
    'be used by workers. They should use the purgeRequests',
    'endpoint that is specific to their workerType and',
    'provisionerId.',
  ].join('\n'),
}, async function(req, res) {
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);
  let openRequests = await fetchResults(this.db.fns.all_purge_requests, {}, { continuation, limit });
  return res.reply({
    continuationToken: openRequests.continuation || '',
    requests: _.map(openRequests.entries, entry => {
      return {
        provisionerId: entry.provisioner_id,
        workerType: entry.worker_type,
        cacheName: entry.cache_name,
        before: entry.before.toJSON(),
      };
    }),
  });
});

builder.declare({
  method: 'get',
  route: '/purge-cache/:provisionerId/:workerType',
  query: {
    since: dt => Date.parse(dt) ? null : 'Invalid Date',
  },
  name: 'purgeRequests',
  output: 'purge-cache-request-list.yml',
  title: 'Open Purge Requests for a provisionerId/workerType pair',
  stability: APIBuilder.stability.stable,
  category: 'Purge-Cache Service',
  description: [
    'List the caches for this `provisionerId`/`workerType` that should to be',
    'purged if they are from before the time given in the response.',
    '',
    'This is intended to be used by workers to determine which caches to purge.',
  ].join('\n'),
}, async function(req, res) {
  let {provisionerId, workerType} = req.params;
  let cacheKey = `${provisionerId}/${workerType}`;
  let since = new Date(req.query.since || 0);

  // Cache the azure query for cacheTime seconds.  Note that if a second request
  // for this cacheKey comes in while the first Azure query is still running, this
  // will start another query.  This is slightly wasteful, but worthwhile for the
  // simpler implementation (see https://bugzilla.mozilla.org/show_bug.cgi?id=1599564
  // for an example of issues with a complex implementation)
  let cacheCache = this.cachePurgeCache[cacheKey];
  if (!cacheCache || Date.now() - cacheCache.touched > this.cfg.app.cacheTime * 1000) {
    cacheCache = this.cachePurgeCache[cacheKey] = {
      reqs: (
        await this.db.fns.cache_purges_to_remove(provisionerId, workerType, since))
        .map(cache => camelCaseKeys(cache),
        ),
      touched: Date.now(),
    };
  }

  let {reqs: openRequests} = cacheCache;

  return res.reply({
    requests: openRequests,
  });
});
