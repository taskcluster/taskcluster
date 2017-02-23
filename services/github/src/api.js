let Debug = require('debug');
let crypto = require('crypto');
let API = require('taskcluster-lib-api');
let _ = require('lodash');

let debugPrefix = 'taskcluster-github:api';
let debug = Debug(debugPrefix);

// Common schema prefix
let SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/github/v1/';

// Strips/replaces undesirable characters which GitHub allows in
// repository/organization names (notably .)
function sanitizeGitHubField(field) {
  return field.replace(/[^a-zA-Z0-9-_\.]/gi, '').replace(/\./g, '%');
};

// Reduce a pull request WebHook's data to only fields needed to checkout a
// revision
//
// See https://developer.github.com/v3/activity/events/types/#pullrequestevent
function getPullRequestDetails(eventData) {
  return {
    'event.base.ref': 'refs/heads/' + eventData.pull_request.base.ref,
    'event.base.repo.branch': eventData.pull_request.base.ref,
    'event.base.repo.name': eventData.pull_request.base.repo.name,
    'event.base.repo.url': eventData.pull_request.base.repo.clone_url,
    'event.base.sha': eventData.pull_request.base.sha,
    'event.base.user.login': eventData.pull_request.base.user.login,

    'event.head.ref': 'refs/heads/' + eventData.pull_request.head.ref,
    'event.head.repo.branch': eventData.pull_request.head.ref,
    'event.head.repo.name': eventData.pull_request.head.repo.name,
    'event.head.repo.url': eventData.pull_request.head.repo.clone_url,
    'event.head.sha': eventData.pull_request.head.sha,
    'event.head.user.login': eventData.sender.login,
    'event.head.user.id': eventData.sender.id,

    'event.pullNumber': eventData.number,
    'event.type': 'pull_request.' + eventData.action,
  };
};

// See https://developer.github.com/v3/activity/events/types/#pushevent
function getPushDetails(eventData) {
  let ref = eventData.ref;
  // parsing the ref refs/heads/<branch-name> is the most reliable way
  // to get a branch name
  let branch = ref.split('/').slice(2).join('/');
  return {
    'event.base.ref': ref,
    'event.base.repo.branch': branch,
    'event.base.repo.name': eventData.repository.name,
    'event.base.repo.url': eventData.repository.clone_url,
    'event.base.sha': eventData.before,
    'event.base.user.login': eventData.sender.login,

    'event.head.ref': ref,
    'event.head.repo.branch': branch,
    'event.head.repo.name': eventData.repository.name,
    'event.head.repo.url': eventData.repository.clone_url,
    'event.head.sha': eventData.after,
    'event.head.user.login': eventData.sender.login,
    'event.head.user.id': eventData.sender.id,

    'event.type': 'push',
  };
};

// See https://developer.github.com/v3/activity/events/types/#releaseevent
function getReleaseDetails(eventData) {
  return {
    'event.type': 'release',
    'event.base.repo.branch': eventData.release.target_commitish,
    'event.head.user.login': eventData.sender.login,
    'event.head.user.id': eventData.sender.id,
    'event.version': eventData.release.tag_name,
    'event.name': eventData.release.name,
    'event.head.repo.name': eventData.repository.name,
    'event.head.repo.url': eventData.repository.clone_url,
    'event.release.url': eventData.release.url,
    'event.prerelease': eventData.release.prerelease,
    'event.draft': eventData.release.draft,
    'event.tar': eventData.release.tarball_url,
    'event.zip': eventData.release.zipball_url,
  };
}

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
  return res.status(status).send(message);
}

/** API end-point for version v1/
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
  context: ['Builds', 'OwnersDirectory', 'monitor', 'publisher'],
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
    'Capture a GitHub event and publish it via pulse, if it\'s a push,',
    'release or pull request.',
  ].join('\n'),
}, async function(req, res) {
  let eventId = req.headers['x-github-delivery'];
  let debug = Debug(debugPrefix + ':' + eventId);

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

  debug('Received ' + eventType + ' event webhook payload. Processing...');

  try {
    if (eventType == 'pull_request') {
      msg.organization = sanitizeGitHubField(body.repository.owner.login),
      msg.action = body.action;
      msg.details = getPullRequestDetails(body);
      msg.installationId = body.installation.id;
      publisherKey = 'pullRequest';
    } else if (eventType == 'push') {
      msg.organization = sanitizeGitHubField(body.repository.owner.name),
      msg.details = getPushDetails(body);
      msg.installationId = body.installation.id;
      publisherKey = 'push';
    } else if (eventType == 'ping') {
      return resolve(res, 200, 'Received ping event!');
    } else if (eventType == 'release') {
      msg.organization = sanitizeGitHubField(body.repository.owner.login),
      msg.details = getReleaseDetails(body);
      msg.installationId = body.installation.id;
      publisherKey = 'release';
    } else if (eventType == 'integration_installation') {
      // Creates a new entity or overwrites an existing one
      await this.OwnersDirectory.create({
        installationId: body.installation.id,
        owner: body.installation.account.login,
      }, true);
      return resolve(res, 200, 'Created table row!');
    } else {
      return resolve(res, 400, 'No publisher available for X-GitHub-Event: ' + eventType);
    }
  } catch (e) {
    debug('Error processing webhook payload!');
    e.webhookPayload = body;
    e.eventId = eventId;
    throw e;
  }

  try {
    debug(`Trying to authenticate as installation for ${eventType}`);
    var instGithub = await this.github.getInstallationGithub(msg.installationId);
  } catch (e) {
    debug('Error authenticating as installation');
    throw e;
  }

  // Not all webhook payloads include an e-mail for the user who triggered an event
  let headUser = msg.details['event.head.user.id'].toString();
  let userDetails = await instGithub.users.getById({id: headUser});
  msg.details['event.head.user.email'] = userDetails.email ||
    msg.details['event.head.user.login'] + '@users.noreply.github.com';
  msg.repository = sanitizeGitHubField(body.repository.name);
  msg.eventId = eventId;

  debug('Beginning publishing event message on pulse.');
  await this.publisher[publisherKey](msg);
  debug('Finished Publishing event message on pulse.');

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
        eventType: entry.eventType,
        eventId: entry.eventId,
        created: entry.created.toJSON(),
        updated: entry.updated.toJSON(),
      };
    }),
  });
});

api.declare({
  name: 'isInstalledFor',
  title: 'Check if Repository has Integration',
  description: [
    'Checks if the integration has been installed for',
    'a given repository of a given organization or user.',
  ].join('\n'),
  stability: 'experimental',
  method: 'get',
  route: '/repository/:owner/:repo',
  output: 'is-installed-for.json',
}, async function(req, res) {
  // Extract owner and repo from request into variables
  let {owner, repo} = req.params;

  // Look up the installation ID in Azure. If no such owner in the table, no error thrown
  let ownerInfo = await this.OwnersDirectory.load({owner}, true);

  if (ownerInfo) {
    try {
      let instGithub = await this.github.getInstallationGithub(ownerInfo.installationId);
      let reposList = await instGithub.integrations.getInstallationRepositories({});

      // GitHub API returns an array of objects, each of wich has an array of repos
      let installed = reposList.repositories.map(repo => repo.name).indexOf(repo);

      return res.reply({installed: installed != -1});
    } catch (e) {
      if (e.code > 400 && e.code < 500) {
        return res.reply({installed: false});
      }
      throw e;
    }
  }
  return res.reply({installed: false});
});
