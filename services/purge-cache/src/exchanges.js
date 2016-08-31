let Exchanges = require('pulse-publisher');
let assert    = require('assert');
let _         = require('lodash');

// Common schema prefix
let SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/purge-cache/v1/';

/** Declaration of exchanges offered by the purge-cache */
let exchanges = new Exchanges({
  title:      'Purge-Cache Exchanges',
  description: [
    'The purge-cache service, typically available at',
    '`purge-cache.taskcluster.net`, is responsible for publishing a pulse',
    'message for workers, so they can purge cache upon request.',
    '',
    'This document describes the exchange offered for workers by the',
    'cache-purge service.',
  ].join('\n'),
});

/** Purge cache exchange */
exchanges.declare({
  exchange:           'purge-cache',
  name:               'purgeCache',
  title:              'Purge Cache Messages',
  description: [
    'When a cache purge is requested  a message will be posted on this',
    'exchange with designated `provisionerId` and `workerType` in the',
    'routing-key and the name of the `cacheFolder` as payload',
  ].join('\n'),
  routingKey:         [
    {
      name:             'routingKeyKind',
      summary:          'Identifier for the routing-key kind. This is ' +
                        'always `\'primary\'` for the formalized routing key.',
      constant:         'primary',
      required:         true,
    }, {
      name:             'provisionerId',
      summary:          '`provisionerId` under which to purge cache.',
      required:         true,
      maxSize:          22,
    }, {
      name:             'workerType',
      summary:          '`workerType` for which to purge cache.',
      required:         true,
      maxSize:          22,
    },
  ],
  schema:             SCHEMA_PREFIX_CONST + 'purge-cache-message.json#',
  messageBuilder:     msg => {
    msg.version = 1;
    return msg;
  },
  routingKeyBuilder:  msg => _.pick(msg, 'provisionerId', 'workerType'),
  CCBuilder:          () => [],
});

// Export exchanges
module.exports = exchanges;
