var base      = require('taskcluster-base');
var assert    = require('assert');
var _         = require('lodash');

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

/** Build common routing key construct for `exchanges.declare` */
var commonRoutingKey = function(options) {
    options = options || {};
     let routingKey = [
        {
          name:             'routingKeyKind',
          summary:          "Identifier for the routing-key kind. This is " +
                            "always `'primary'` for the formalized routing key.",
          constant:         'primary',
          required:         true
        }, {
          name:             'organization',
          summary:          "The GitHub `organization` which had an event. " +
                            "All periods have been replaced by % - such that " +
                            "foo.bar becomes foo%bar - and all other special " +
                            "characters aside from - and _ have been stripped.",
          maxSize:          100,
          required:         true
        }, {
          name:             'repository',
          summary:          "The GitHub `repository` which had an event." +
                            "All periods have been replaced by % - such that " +
                            "foo.bar becomes foo%bar - and all other special " +
                            "characters aside from - and _ have been stripped.",
          maxSize:          100,
          required:         true
        }
    ]
    if (options.hasActions) {
      routingKey.push({
          name:             'action',
          summary:          "The GitHub `action` which triggered an event. " +
                            "See for possible values see the payload actions " +
                            "property.",
          maxSize:          22,
          required:         true
        })
    }
    return routingKey;
};

var commonMessageBuilder = function(msg) {
    msg.version = 1;
    return msg;
};

/** Declaration of exchanges offered by the github */
var exchanges = new base.Exchanges({
  title:      "TaskCluster-Github Exchanges",
  description: [
    "The github service, typically available at",
    "`github.taskcluster.net`, is responsible for publishing a pulse",
    "message for supported github events.",
    "",
    "This document describes the exchange offered by the taskcluster",
    "github service"
  ].join('\n')
});

/** pull request exchange */
exchanges.declare({
  exchange:           'pull-request',
  name:               'pullRequest',
  title:              "GitHub Pull Request Event",
  description: [
    "When a GitHub pull request event is posted it will be broadcast on this",
    "exchange with the designated `organization` and `repository`",
    "in the routing-key along with event specific metadata in the payload."
  ].join('\n'),
  routingKey:         commonRoutingKey({hasActions: true}),
  schema:             SCHEMA_PREFIX_CONST + 'github-pull-request-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  msg => _.pick(msg, 'organization', 'repository', 'action'),
  CCBuilder:          () => []
});

/** push exchange */
exchanges.declare({
  exchange:           'push',
  name:               'push',
  title:              "GitHub push Event",
  description: [
    "When a GitHub push event is posted it will be broadcast on this",
    "exchange with the designated `organization` and `repository`",
    "in the routing-key along with event specific metadata in the payload."
  ].join('\n'),
  routingKey:         commonRoutingKey(),
  schema:             SCHEMA_PREFIX_CONST + 'github-push-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  msg => _.pick(msg, 'organization', 'repository'),
  CCBuilder:          () => []
});

// Export exchanges
module.exports = exchanges;
