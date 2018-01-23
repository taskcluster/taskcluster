let Exchanges = require('pulse-publisher');
let assert = require('assert');
let _ = require('lodash');
let debug = require('debug')('taskcluster-github:exchanges');

// Common schema prefix
let SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

/** Build common routing key construct for `exchanges.declare` */
let commonRoutingKey = function(options) {
  options = options || {};
  let routingKey = [
    {
      name:             'routingKeyKind',
      summary:          'Identifier for the routing-key kind. This is ' +
                        'always `"primary"` for the formalized routing key.',
      constant:         'primary',
      required:         true,
    }, {
      name:             'organization',
      summary:          'The GitHub `organization` which had an event. ' +
                        'All periods have been replaced by % - such that ' +
                        'foo.bar becomes foo%bar - and all other special ' +
                        'characters aside from - and _ have been stripped.',
      maxSize:          100,
      required:         true,
    }, {
      name:             'repository',
      summary:          'The GitHub `repository` which had an event.' +
                        'All periods have been replaced by % - such that ' +
                        'foo.bar becomes foo%bar - and all other special ' +
                        'characters aside from - and _ have been stripped.',
      maxSize:          100,
      required:         true,
    },
  ];
  if (options.hasActions) {
    routingKey.push({
      name:             'action',
      summary:          'The GitHub `action` which triggered an event. ' +
                        'See for possible values see the payload actions ' +
                        'property.',
      maxSize:          22,
      required:         true,
    });
  }
  return routingKey;
};

let commonMessageBuilder = function(msg) {
  msg.version = 1;
  return msg;
};

// Temporary function for debugging purposes. TO DO: remove
let releaseMessageBuilder = function(msg) {
  debug('Received webhook for release. Building message...');
  msg.version = 1;
  return msg;
};

/** Declaration of exchanges offered by the github */
let exchanges = new Exchanges({
  title:      'Taskcluster-Github Exchanges',
  description: [
    'The github service, typically available at',
    '`github.taskcluster.net`, is responsible for publishing a pulse',
    'message for supported github events.',
    '',
    'This document describes the exchange offered by the taskcluster',
    'github service',
  ].join('\n'),
});

/** pull request exchange */
exchanges.declare({
  exchange:           'pull-request',
  name:               'pullRequest',
  title:              'GitHub Pull Request Event',
  description: [
    'When a GitHub pull request event is posted it will be broadcast on this',
    'exchange with the designated `organization` and `repository`',
    'in the routing-key along with event specific metadata in the payload.',
  ].join('\n'),
  routingKey:         commonRoutingKey({hasActions: true}),
  schema:             SCHEMA_PREFIX_CONST + 'github-pull-request-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  msg => _.pick(msg, 'organization', 'repository', 'action'),
  CCBuilder:          () => [],
});

/** push exchange */
exchanges.declare({
  exchange:           'push',
  name:               'push',
  title:              'GitHub push Event',
  description: [
    'When a GitHub push event is posted it will be broadcast on this',
    'exchange with the designated `organization` and `repository`',
    'in the routing-key along with event specific metadata in the payload.',
  ].join('\n'),
  routingKey:         commonRoutingKey(),
  schema:             SCHEMA_PREFIX_CONST + 'github-push-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  msg => _.pick(msg, 'organization', 'repository'),
  CCBuilder:          () => [],
});

/** release exchange */
exchanges.declare({
  exchange:           'release',
  name:               'release',
  title:              'GitHub release Event',
  description: [
    'When a GitHub release event is posted it will be broadcast on this',
    'exchange with the designated `organization` and `repository`',
    'in the routing-key along with event specific metadata in the payload.',
  ].join('\n'),
  routingKey:         commonRoutingKey(),
  schema:             SCHEMA_PREFIX_CONST + 'github-release-message.json#',
  messageBuilder:     releaseMessageBuilder, // TO DO: replace with commonMessageBuilder
  routingKeyBuilder:  msg => _.pick(msg, 'organization', 'repository'),
  CCBuilder:          () => [],
});

// Export exchanges
module.exports = exchanges;
