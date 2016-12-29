let debug = require('debug')('taskcluster-github');
let crypto = require('crypto');
let API = require('taskcluster-lib-api');
let _ = require('lodash');

// Common schema prefix
let SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

// Strips/replaces undesirable characters which GitHub allows in
// repository/organization names (notably .)
function sanitizeGitHubField(field) {
  return field.replace(/[^a-zA-Z0-9-_\.]/gi, '').replace(/\./g, '%');
};

// Reduce a pull request WebHook's data to only fields needed to checkout a
// revision
function getPullRequestDetails(eventData) {
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

function getPushDetails(eventData) {
  let ref = eventData.ref;
  // parsing the ref refs/heads/<branch-name> is the most reliable way
  // to get a branch name
  let branch = ref.split('/')[2];
  return {
    'event.type': 'push',
    'event.base.repo.branch': branch,
    'event.head.repo.branch': branch,
    'event.head.user.login': eventData.sender.login,
    'event.head.repo.url': eventData.repository.clone_url,
    'event.head.sha': eventData.after,
    'event.head.ref': ref,
    'event.base.sha': eventData.before,
  };
};

/**
 * Hashes a payload by some secret, using the same algorithm that
 * GitHub uses to compute their X-Hub-Signature HTTP header. Used
 * for verifying the legitimacy of WebHooks.
 **/
function generateXHubSignature(secret, payload) {
  return 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');
};

/**
 * Compare hmac.digest('hex') signatures in constant time
 * Double hmac verification is the preferred way to do this
 * since we can't predict optimizations performed by the runtime.
 * https: *www.isecpartners.com/blog/2011/february/double-hmac-verification.aspx
 **/
function compareSignatures(sOne, sTwo) {
  let secret = Math.random().toString();
  let h1 = crypto.createHmac('sha1', secret).update(sOne);
  let h2 = crypto.createHmac('sha1', secret).update(sTwo);
  return h1.digest('hex') === h2.digest('hex');
};

function resolve(res, status, message) {
  debug(message);
  return res.status(status).send(message);
}

/** API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   publisher:      // publisher from base.Exchanges
 * }
 */
let api = new API({
  title:        'TaskCluster GitHub API Documentation',
  description: [
    'The github service, typically available at',
    '`github.taskcluster.net`, is responsible for publishing pulse',
    'messages in response to GitHub events.',
    '',
    'This document describes the API end-point for consuming GitHub',
    'web hooks',
  ].join('\n'),
  schemaPrefix: 'http://schemas.taskcluster.net/github/v1/',
  context: ['Builds', 'monitor'],
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
    return resolve(res, 400, 'Missing X-GitHub-Event');
  }

  let body = req.body;
  if (!body) {
    return resolve(res, 400, 'Request missing a body');
  }

  let webhookSecrets = this.cfg.webhook.secret;
  let xHubSignature = req.headers['x-hub-signature'];

  if (xHubSignature && !webhookSecrets) {
    return resolve(res, 400, 'Server is not setup to handle secrets');
  } else if (webhookSecrets && !xHubSignature) {
    return resolve(res, 400, 'Request missing a secret');
  } else if (webhookSecrets && xHubSignature) {
    // Verify that our payload is legitimate
    if (!webhookSecrets.some(webhookSecret => {
      let calculatedSignature = generateXHubSignature(webhookSecret,
        JSON.stringify(body));
      return compareSignatures(calculatedSignature, xHubSignature);
    })) {
      return resolve(res, 403, 'X-hub-signature does not match; bad webhook secret?');
    }
  }

  let msg = {};
  let publisherKey = '';

  try {
    if (eventType == 'pull_request') {
      msg.organization = sanitizeGitHubField(body.repository.owner.login),
      msg.action = body.action;
      msg.details = getPullRequestDetails(body);
      publisherKey = 'pullRequest';
    } else if (eventType == 'push') {
      msg.organization = sanitizeGitHubField(body.repository.owner.name),
      msg.details = getPushDetails(body);
      publisherKey = 'push';
    } else if (eventType == 'ping') {
      return resolve(res, 200, 'Received ping event!');
    } else {
      return resolve(res, 400, 'No publisher available for X-GitHub-Event: ' + eventType);
    }
  } catch (e) {
    e.webhookPayload = body;
    throw e;
  }

  // Not all webhook payloads include an e-mail for the user who triggered
  // an event.
  let headUser = msg.details['event.head.user.login'];
  let userDetails = await this.github.users.get(headUser);

  msg.details['event.head.user.email'] = userDetails.email || headUser + '@users.noreply.github.com';
  msg.repository = sanitizeGitHubField(body.repository.name);

  await this.publisher[publisherKey](msg);

  res.status(204).send();
});

api.declare({
  method:     'get',
  route:      '/builds',
  name:       'builds',
  title:      'List of Builds',
  stability:  'experimental',
  output:     'build-list.json#',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
    organization: /^([a-zA-Z0-9-_%]*)$/,
    repository: /^([a-zA-Z0-9-_%]*)$/,
    sha: /./,
  },
  description: [
    'A paginated list of builds that have been run in',
    'Taskcluster. Can be filtered on various git-specific',
    'fields.',
  ].join('\n'),
}, async function(req, res) {
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);
  let query = _.pick(req.query, ['organization', 'repository', 'sha']);
  let builds = await this.Builds.scan(query, {continuation, limit});
  return res.reply({
    continuationToken: builds.continuation || '',
    builds: builds.entries.map(entry => {
      return {
        organization: entry.organization,
        repository: entry.repository,
        sha: entry.sha,
        state: entry.state,
        taskGroupId: entry.taskGroupId,
        created: entry.created.toJSON(),
        updated: entry.updated.toJSON(),
      };
    }),
  });
});
