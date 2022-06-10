const { Exchanges } = require('taskcluster-lib-pulse');
const _ = require('lodash');
const assert = require('assert');
const { PUBLISHERS } = require('./constants');

/** Build common routing key construct for `exchanges.declare` */
const commonRoutingKey = function(options) {
  options = options || {};
  let routingKey = [
    {
      name: 'routingKeyKind',
      summary: 'Identifier for the routing-key kind. This is ' +
                        'always `"primary"` for the formalized routing key.',
      constant: 'primary',
      required: true,
    }, {
      name: 'organization',
      summary: 'The GitHub `organization` which had an event. ' +
                        'All periods have been replaced by % - such that ' +
                        'foo.bar becomes foo%bar - and all other special ' +
                        'characters aside from - and _ have been stripped.',
      maxSize: 100,
      required: true,
    }, {
      name: 'repository',
      summary: 'The GitHub `repository` which had an event.' +
                        'All periods have been replaced by % - such that ' +
                        'foo.bar becomes foo%bar - and all other special ' +
                        'characters aside from - and _ have been stripped.',
      maxSize: 100,
      required: true,
    },
  ];
  if (options.hasActions) {
    routingKey.push({
      name: 'action',
      summary: 'The GitHub `action` which triggered an event. ' +
                        'See for possible values see the payload actions ' +
                        'property.',
      maxSize: 22,
      required: true,
    });
  }
  return routingKey;
};

const commonMessageBuilder = function(msg) {
  msg.version = 1;
  return msg;
};

/** Build list of routing keys to CC */
const commonCCBuilder = (message, routes) => {
  assert(Array.isArray(routes), 'Routes must be an array');
  return routes.map(route => 'route.' + route);
};

/** Declaration of exchanges offered by the github */
let exchanges = new Exchanges({
  serviceName: 'github',
  projectName: 'taskcluster-github',
  apiVersion: 'v1',
  title: 'Taskcluster-Github Exchanges',
  description: [
    'The github service publishes a pulse',
    'message for supported github events, translating Github webhook',
    'events into pulse messages.',
    '',
    'This document describes the exchange offered by the taskcluster',
    'github service',
  ].join('\n'),
});

/** pull request exchange */
exchanges.declare({
  exchange: 'pull-request',
  name: PUBLISHERS.PULL_REQUEST,
  title: 'GitHub Pull Request Event',
  description: [
    'When a GitHub pull request event is posted it will be broadcast on this',
    'exchange with the designated `organization` and `repository`',
    'in the routing-key along with event specific metadata in the payload.',
  ].join('\n'),
  routingKey: commonRoutingKey({ hasActions: true }),
  schema: 'github-pull-request-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKeyBuilder: msg => _.pick(msg, 'organization', 'repository', 'action'),
  CCBuilder: () => [],
});

/** push exchange */
exchanges.declare({
  exchange: 'push',
  name: PUBLISHERS.PUSH,
  title: 'GitHub push Event',
  description: [
    'When a GitHub push event is posted it will be broadcast on this',
    'exchange with the designated `organization` and `repository`',
    'in the routing-key along with event specific metadata in the payload.',
  ].join('\n'),
  routingKey: commonRoutingKey(),
  schema: 'github-push-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKeyBuilder: msg => _.pick(msg, 'organization', 'repository'),
  CCBuilder: () => [],
});

/** release exchange */
exchanges.declare({
  exchange: 'release',
  name: PUBLISHERS.RELEASE,
  title: 'GitHub release Event',
  description: [
    'When a GitHub release event is posted it will be broadcast on this',
    'exchange with the designated `organization` and `repository`',
    'in the routing-key along with event specific metadata in the payload.',
  ].join('\n'),
  routingKey: commonRoutingKey(),
  schema: 'github-release-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKeyBuilder: msg => _.pick(msg, 'organization', 'repository'),
  CCBuilder: () => [],
});

/** rerun exchange */
exchanges.declare({
  exchange: 'rerun',
  name: PUBLISHERS.RERUN,
  title: 'GitHub re-run task Event',
  description: [
    'When a GitHub check_run event with action="rerequested" is posted ',
    'it will be broadcast on this exchange with the designated ',
    '`organization` and `repository`',
    'in the routing-key along with event specific metadata in the payload.',
  ].join('\n'),
  routingKey: commonRoutingKey(),
  schema: 'github-rerun-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKeyBuilder: msg => _.pick(msg, 'organization', 'repository'),
  CCBuilder: () => [],
});

/** task group exchange */
exchanges.declare({
  exchange: 'task-group-creation-requested',
  name: 'taskGroupCreationRequested',
  title: 'tc-gh requested the Queue service to create all the tasks in a group',
  description: [
    'supposed to signal that taskCreate API has been called for every task in the task group',
    'for this particular repo and this particular organization',
    'currently used for creating initial status indicators in GitHub UI using Statuses API.',
    'This particular exchange can also be bound to RabbitMQ queues by custom routes - for that,',
    'Pass in the array of routes as a second argument to the publish method. Currently, we do',
    'use the statuses routes to bind the handler that creates the initial status.',
  ].join('\n'),
  routingKey: commonRoutingKey(),
  schema: 'task-group-creation-requested.yml',
  messageBuilder: commonMessageBuilder,
  routingKeyBuilder: msg => _.pick(msg, 'organization', 'repository'),
  CCBuilder: commonCCBuilder,
});

// Export exchanges
module.exports = exchanges;
