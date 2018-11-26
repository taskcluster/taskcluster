const _ = require('lodash');
const debug = require('debug')('purge-cache');
const APIBuilder = require('taskcluster-lib-api');
const taskcluster = require('taskcluster-client');
const Entity = require('azure-entities');

// Common patterns URL parameters
const GENERIC_ID_PATTERN = /^[a-zA-Z0-9-_]{1,22}$/;

/** API end-point for version v1/ */
const builder = new APIBuilder({
  title:        'Purge Cache API',
  context: [
    'cfg',              // A typed-env-config instance
    'CachePurge',      // A data.CachePurge instance
    'cachePurgeCache', // An Promise for cacheing cachepurge responses
  ],
  params: {
    provisionerId:    GENERIC_ID_PATTERN,
    workerType:       GENERIC_ID_PATTERN,
  },
  description: [
    'The purge-cache service is responsible for publishing a pulse',
    'message for workers, so they can purge cache upon request.',
    '',
    'This document describes the API end-point for publishing the pulse',
    'message. This is mainly intended to be used by tools.',
  ].join('\n'),
  serviceName: 'purge-cache',
  apiVersion: 'v1',
});

// Export API
module.exports = builder;

/** Define tasks */
builder.declare({
  method:     'post',
  route:      '/purge-cache/:provisionerId/:workerType',
  name:       'purgeCache',
  scopes:     'purge-cache:<provisionerId>/<workerType>:<cacheName>',
  input:      'purge-cache-request.yml',
  title:      'Purge Worker Cache',
  stability:  APIBuilder.stability.stable,
  description: [
    'Publish a purge-cache message to purge caches named `cacheName` with',
    '`provisionerId` and `workerType` in the routing-key. Workers should',
    'be listening for this message and purge caches when they see it.',
  ].join('\n'),
}, async function(req, res) {
  let {provisionerId, workerType} = req.params;
  let {cacheName} = req.body;

  debug(`Processing request for ${provisionerId}/${workerType}/${cacheName}.`);

  await req.authorize({provisionerId, workerType, cacheName});

  try {
    await this.CachePurge.create({
      workerType,
      provisionerId,
      cacheName,
      before: new Date(),
      expires: taskcluster.fromNow('1 day'),
    });
  } catch (err) {
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }
    let cb = await this.CachePurge.load({
      workerType,
      provisionerId,
      cacheName,
    });

    await cb.modify(cachePurge => {
      cachePurge.before = new Date();
      cachePurge.expires = taskcluster.fromNow('1 day');
    });
  }

  // Return 204
  res.status(204).send();
});

builder.declare({
  method:   'get',
  route:    '/purge-cache/list',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name:     'allPurgeRequests',
  output:   'all-purge-cache-request-list.yml',
  title:    'All Open Purge Requests',
  stability:  APIBuilder.stability.stable,
  description: [
    'This is useful mostly for administors to view',
    'the set of open purge requests. It should not',
    'be used by workers. They should use the purgeRequests',
    'endpoint that is specific to their workerType and',
    'provisionerId.',
  ].join('\n'),
}, async function(req, res) {
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);
  let openRequests = await this.CachePurge.scan({}, {continuation, limit});
  return res.reply({
    continuationToken: openRequests.continuation || '',
    requests: _.map(openRequests.entries, entry => {
      return {
        provisionerId: entry.provisionerId,
        workerType: entry.workerType,
        cacheName: entry.cacheName,
        before: entry.before.toJSON(),
      };
    }),
  });
});

builder.declare({
  method:   'get',
  route:    '/purge-cache/:provisionerId/:workerType',
  query: {
    since: dt => Date.parse(dt) ? null : 'Invalid Date',
  },
  name:     'purgeRequests',
  output:   'purge-cache-request-list.yml',
  title:    'Open Purge Requests for a provisionerId/workerType pair',
  stability:  APIBuilder.stability.stable,
  description: [
    'List of caches that need to be purged if they are from before',
    'a certain time. This is safe to be used in automation from',
    'workers.',
  ].join('\n'),
}, async function(req, res) {

  let {provisionerId, workerType} = req.params;
  let cacheKey = `${provisionerId}/${workerType}`;
  let since = new Date(req.query.since || 0);

  this.cachePurgeCache[cacheKey] = Promise.resolve(this.cachePurgeCache[cacheKey]).then(async cacheCache => {
    if (cacheCache && Date.now() - cacheCache.touched < this.cfg.app.cacheTime * 1000) {
      return cacheCache;
    }
    return Promise.resolve({reqs: await this.CachePurge.query({provisionerId, workerType}), touched: Date.now()});
  });

  let {reqs: openRequests} = await this.cachePurgeCache[cacheKey];
  return res.reply({
    requests: _.reduce(openRequests.entries, (l, entry) => {
      if (entry.before >= since) {
        l.push({
          provisionerId: entry.provisionerId,
          workerType: entry.workerType,
          cacheName: entry.cacheName,
          before: entry.before.toJSON(),
        });
      }
      return l;
    }, []),
  });
});
