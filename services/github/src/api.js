import base from 'taskcluster-base';
import github from './github';
import _ from 'lodash';

// Common schema prefix
let SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

// Strips/replaces undesirable characters which GitHub allows in
// repository/organization names (notably .)
function sanitizeGitHubField (field) {
  return field.replace(/[^a-zA-Z0-9-_\.]/gi, '').replace(/\./g, '%');
};

// Reduce a pull request WebHook's data to only fields needed to checkout a
// revision
function getPullRequestDetails (eventData) {
  return {
    'event.type': 'pull_request.' + eventData.action,
    'event.base.repo.branch': eventData.pull_request.base.label.split(':')[1],
    'event.pullNumber': eventData.number,
    'event.base.user.login': eventData.pull_request.base.user.login,
    'event.base.repo.url': eventData.pull_request.base.repo.clone_url,
    'event.base.sha': eventData.pull_request.base.sha,
    'event.base.ref': eventData.pull_request.base.ref,
    'event.head.user.login': eventData.pull_request.head.user.login,
    'event.head.repo.url': eventData.pull_request.head.repo.clone_url,
    'event.head.repo.branch': eventData.pull_request.head.label.split(':')[1],
    'event.head.sha': eventData.pull_request.head.sha,
    'event.head.ref': eventData.pull_request.head.ref,
  };
};

function getPushDetails (eventData) {
  let ref = eventData.ref || eventData.head_commit.ref;
  // parsing the ref refs/heads/<branch-name> is the most reliable way
  // to get a branch name
  let branch = ref.split('/')[2];
  return {
    'event.type': 'push',
    'event.base.repo.branch': branch,
    'event.head.repo.branch': branch,
    'event.head.user.login': eventData.head_commit.author.username,
    'event.head.repo.url': eventData.repository.clone_url,
    'event.head.sha': eventData.head_commit.id,
    'event.head.ref': ref,
  };
};

/** API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   publisher:      // publisher from base.Exchanges
 * }
 */
let api = new base.API({
  title:        'TaskCluster GitHub API Documentation',
  description: [
    'The github service, typically available at',
    '`github.taskcluster.net`, is responsible for publishing pulse',
    'messages in response to GitHub events.',
    '',
    'This document describes the API end-point for consuming GitHub',
    'web hooks',
  ].join('\n'),
});

// Export API
module.exports = api;

/** Define tasks */
api.declare({
  method:     'post',
  route:      '/github',
  name:       'githubWebHookConsumer',
  title:      'Consume GitHub WebHook',
  stability:  'experimental',
  description: [
    'Capture a GitHub event and publish it via pulse, if it\'s a push',
    'or pull request.',
  ].join('\n'),
}, async function(req, res) {
  let eventType = req.headers['x-github-event'];
  if (!eventType) {
    res.status(400).send('Missing X-GitHub-Event');
  }

  let body = req.body;
  if (!body) {
    req.status(400).send('Request missing a body');
  }

  let webhookSecret = this.cfg.webhook.secret;
  let xHubSignature = req.headers['x-hub-signature'];

  if (xHubSignature && !webhookSecret) {
    res.status(400).send('Server is not setup to handle secrets');
    return;
  } else if (webhookSecret && !xHubSignature) {
    res.status(400).send('Request missing a secret');
    return;
  } else if (webhookSecret && xHubSignature) {
    // Verify that our payload is legitimate
    let calculatedSignature = github.generateXHubSignature(webhookSecret,
      JSON.stringify(body));
    if (!github.compareSignatures(calculatedSignature, xHubSignature)) {
      res.status(403).send('Bad Signature');
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
  } else {
    // Looks like no publisherKey is available
    res.status(400).send('No publisher available for X-GitHub-Event: ' + eventType);
    return;
  }

  // Not all webhook payloads include an e-mail for the user who triggered
  // an event.
  let headUser = msg.details['event.head.user.login'];
  let userDetails = await this.github.users(headUser).fetch();

  msg.details['event.head.user.email'] = userDetails.email || headUser + '@noreply.github.com';
  msg.repository = sanitizeGitHubField(body.repository.name);

  await this.publisher[publisherKey](msg);

  res.status(204).send();
});

/** Check that the server is a alive */
api.declare({
  method:     'get',
  route:      '/ping',
  name:       'ping',
  title:      'Ping Server',
  stability:  'experimental',
  description: [
    'Documented later...',
    '',
    '**Warning** this api end-point is **not stable**.',
  ].join('\n'),
}, function (req, res) {

  res.status(200).json({
    alive:    true,
    uptime:   process.uptime(),
  });
});
