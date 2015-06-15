var base      = require('taskcluster-base');

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/purge-cache/v1/';

/** API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   publisher:      // publisher from base.Exchanges
 * }
 */
var api = new base.API({
  title:        "Purge Cache API Documentation",
  description: [
    "The purge-cache service, typically available at",
    "`purge-cache.taskcluster.net`, is responsible for publishing a pulse",
    "message for workers, so they can purge cache upon request.",
    "",
    "This document describes the API end-point for publishing the pulse",
    "message. This is mainly intended to be used by tools."
  ].join('\n')
});

// Export API
module.exports = api;

/** Define tasks */
api.declare({
  method:     'post',
  route:      '/purge-cache/:provisionerId/:workerType',
  name:       'purgeCache',
  scopes:     [
    'purge-cache:<provisionerId>/<workerType>:<cacheName>'
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'purge-cache-request.json#',
  title:      "Purge Worker Cache",
  description: [
    "Publish a purge-cache message to purge caches named `cacheName` with",
    "`provisionerId` and `workerType` in the routing-key. Workers should",
    "be listening for this message and purge caches when they see it."
  ].join('\n')
}, async function(req, res) {
  let {provisionerId, workerType} = req.params;
  let {cacheName} = req.body;

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if(!req.satisfies({provisionerId, workerType, cacheName})) {
    return;
  }

  // Publish message
  await this.publisher.purgeCache({provisionerId, workerType, cacheName});

  // Return 204
  res.status(204).send();
});

/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  title:    "Ping Server",
  description: [
    "Documented later...",
    "",
    "**Warning** this api end-point is **not stable**."
  ].join('\n')
}, function(req, res) {

  res.status(200).json({
    alive:    true,
    uptime:   process.uptime()
  });
});