var base      = require('taskcluster-base');
var github    = require('./github');
var _         = require('lodash');

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

// Strips/replaces undesirable characters which GitHub allows in
// repository/organization names (notably .)
function sanitizeGitHubField(field) {
  return field.replace(/[^a-zA-Z0-9-_\.]/gi, '').replace(/\./g, '%')
};

// Reduce a pull request WebHook's data to only fields needed to checkout a
// revision
function getPullRequestDetails(eventData) {
  return {
    event: 'pull_request.' + eventData.action,
    // The base branch is simply referred to as branch, to remove
    // confusion when dealing with push requests, which only have
    // a single branch
    branch: eventData.pull_request.base.label.split(':')[1],
    pullNumber: eventData.number,
    baseUser: eventData.pull_request.base.user.login,
    baseRepoUrl: eventData.pull_request.base.repo.clone_url,
    baseSha: eventData.pull_request.base.sha,
    baseRef: eventData.pull_request.base.ref,
    headUser: eventData.pull_request.head.user.login,
    headRepoUrl: eventData.pull_request.head.repo.clone_url,
    headBranch: eventData.pull_request.head.label.split(':')[1],
    headSha: eventData.pull_request.head.sha,
    headRef: eventData.pull_request.head.ref
  };
};

function getPushDetails(eventData) {
  return {
    event: 'push',
    branch: eventData.repository.default_branch,
    headUser: eventData.head_commit.author.username,
    headRepoUrl: eventData.repository.clone_url,
    headSha: eventData.head_commit.id,
    headRef: eventData.head_commit.ref
  };
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

  let msg = {};
  let publisherKey = '';

  if (eventType == 'pull_request') {
    msg.organization = sanitizeGitHubField(body.repository.owner.login),
    msg.action = body.action;
    msg.details = getPullRequestDetails(body);
    publisherKey = 'pullRequest';
  } else if (eventType == 'push') {
    msg.organization = sanitizeGitHubField(body.repository.owner.name),
    msg.details = getPushDetails(body);
    publisherKey = 'push';
  } else{
    // Looks like no publisherKey is available
    res.status(400).send("No publisher available for X-GitHub-Event: " + eventType);
    return;
  }

  // Not all webhook payloads include an e-mail for the user who triggered
  // an event.
  let headUser = msg.details.headUser;
  let userDetails = await this.githubAPI.users(headUser).fetch();

  msg.details.headUserEmail = userDetails.email || headUser + '@noreply.github.com'
  msg.repository = sanitizeGitHubField(body.repository.name);

  await this.publisher[publisherKey](msg);

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
