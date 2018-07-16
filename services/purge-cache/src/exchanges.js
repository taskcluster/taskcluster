const Exchanges = require('pulse-publisher');
const assert = require('assert');
const _ = require('lodash');

/** Declaration of exchanges offered by the purge-cache */
const exchanges = new Exchanges({
  projectName: 'taskcluster-purge-cache',
  serviceName: 'purge-cache',
  version: 'v1',
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
  schema:             'purge-cache-message.yml',
  messageBuilder:     msg => {
    msg.version = 1;
    return msg;
  },
  routingKeyBuilder:  msg => _.pick(msg, 'provisionerId', 'workerType'),
  CCBuilder:          () => [],
});

// Export exchanges
module.exports = exchanges;
