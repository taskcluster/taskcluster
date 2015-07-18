var base      = require('taskcluster-base');
var github    = require('./github');
var _         = require('lodash');

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

// Convert GitHub event types to their expected publisher name
function eventTypeToPublisherName(eventType) {
  let firstUnderscore = eventType.indexOf("_")
  if (firstUnderscore < 0) {
    return eventType
  }
  let publisherName = eventType.substring(0, firstUnderscore)
  publisherName += eventType.substring(
    firstUnderscore + 1, firstUnderscore + 2).toUpperCase()
  publisherName += eventType.substring(firstUnderscore + 2, eventType.length)
  return eventTypeToPublisherName(publisherName)
};

// Strips/replaces undesirable characters which GitHub allows in
// repository/organization names (notably .)
function sanitizeGitHubField(field) {
  return field.replace(/[^a-zA-Z0-9-_\.]/gi, '').replace(/\./g, '%')
};

/** API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   publisher:      // publisher from base.Exchanges
 * }
 */
var api = new base.API({
  title:        "TaskCluster GitHub API Documentation",
  description: [
    "The github service, typically available at",
    "`github.taskcluster.net`, is responsible for publishing pulse",
    "messages in response to GitHub events.",
    "",
    "This document describes the API end-point for consuming GitHub",
    "web hooks"
  ].join('\n')
});

// Export API
module.exports = api;

/** Define tasks */
api.declare({
  method:     'post',
  route:      '/github',
  name:       'githubWebHookConsumer',
  scopes:     undefined,
  title:      "Consume GitHub WebHook",
  description: [
    "Capture a GitHub event and publish it via pulse, if it's a push",
    "or pull request."
  ].join('\n')
}, async function(req, res) {
  let eventType = req.headers['x-github-event'];
  if (!eventType) {
    res.status(400).send("Missing X-GitHub-Event");
  }

  let body = req.body
  if (!body) {
    req.status(400).send("Request missing a body");
  }

  // When pulse is activated, locate valid publishers by naming
  // convention and fail if we don't find one which matches the
  // event type
  if (!(this.publisher[eventTypeToPublisherName(eventType)] instanceof Function)) {
    res.status(400).send("No publisher available for X-GitHub-Event: " + eventType);
    return;
  }

  let webhookSecret = this.cfg.get('webhook:secret');
  let xHubSignature = req.headers['x-hub-signature'];

  if (xHubSignature && !webhookSecret) {
    res.status(400).send("Server is not setup to handle secrets");
    return;
  } else if (webhookSecret && !xHubSignature) {
    res.status(400).send("Request missing a secret");
    return;
  } else if (webhookSecret && xHubSignature) {
    // Verify that our payload is legitimate
    let calculatedSignature = github.generateXHubSignature(webhookSecret,
      JSON.stringify(body));
    if (!github.compareSignatures(calculatedSignature, xHubSignature)) {
      res.status(403).send("Bad Signature");
      return;
    }
  }

  let msg = {
    organization: sanitizeGitHubField(body.organization.login),
    repository: sanitizeGitHubField(body.repository.name),
    details: {commits: body.commits, pull_request: body.pull_request}
  };

  if (body.action) {
    msg.action = body.action
  }

  await this.publisher[eventTypeToPublisherName(eventType)](msg);

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
