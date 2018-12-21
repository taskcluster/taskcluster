const Debug = require('debug');
const crypto = require('crypto');
const APIBuilder = require('taskcluster-lib-api');
const _ = require('lodash');
const Entity = require('azure-entities');

const debugPrefix = 'taskcluster-github:api';
const debug = Debug(debugPrefix);

// Strips/replaces undesirable characters which GitHub allows in
// repository/organization names (notably .)
function sanitizeGitHubField(field) {
  return field.replace(/[^a-zA-Z0-9-_\.]/gi, '').replace(/\./g, '%');
}

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
    'event.title': eventData.pull_request.title,
    'event.type': 'pull_request.' + eventData.action,
  };
}

// See https://developer.github.com/v3/activity/events/types/#pushevent
function getPushDetails(eventData) {
  let ref = eventData.ref;
  // parsing the ref refs/heads/<branch-name> is the most reliable way
  // to get a branch name
  // However, tags are identified the ref refs/tags/<tag-name> 
  let refName = ref.split('/').slice(2).join('/');
  let isTagEvent = ref.split('/')[1] === 'tags';
  let details = {
    'event.base.ref': ref,
    'event.base.repo.name': eventData.repository.name,
    'event.base.repo.url': eventData.repository.clone_url,
    'event.base.sha': eventData.before,
    'event.base.user.login': eventData.sender.login,

    'event.head.ref': ref,
    'event.head.repo.name': eventData.repository.name,
    'event.head.repo.url': eventData.repository.clone_url,
    'event.head.sha': eventData.after,
    'event.head.user.login': eventData.sender.login,
    'event.head.user.id': eventData.sender.id,

    'event.type': isTagEvent? 'tag' : 'push',
  };
  if (isTagEvent) {
    details['event.head.tag'] = refName;
  } else {
    details['event.base.repo.branch'] = refName;
    details['event.head.repo.branch'] = refName;

  }
  return details;
  
}

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
}

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
}

function resolve(res, status, message) {
  return res.status(status).send(message);
}

/***
 Helper function to look up repo owner in the Azure table to get installation ID,
 and authenticate with GitHub using that ID.

 Receives owner's name, the Azure table, and github object.
 Returns either authenticated github object or null
***/
async function installationAuthenticate(owner, OwnersDirectory, github) {
  // Look up the installation ID in Azure. If no such owner in the table, no error thrown
  let ownerInfo = await OwnersDirectory.load({owner}, true);
  if (ownerInfo) {
    return await github.getInstallationGithub(ownerInfo.installationId);
  } else {
    return null;
  }
}

/***
 Helper function to find the most fresh status set by our bot.
 Gets the bot's ID, gets statuses for the repo/branch, finds there the status by the bot's ID
 
 Receives authenticated github object; names of owner, repo and branch; and configuration object
 Returns either status object or undefined (if not found).
***/
async function findTCStatus(github, owner, repo, branch, configuration) {
  let taskclusterBot = (await github.users.getForUser({username: configuration.app.botName})).data;
  // Statuses is an array of status objects, where we find the relevant status
  let statuses = (await github.repos.getStatuses({owner, repo, ref: branch})).data;
  return statuses.find(statusObject => statusObject.creator.id === taskclusterBot.id);
}

/** API end-point for version v1/
 */
let builder = new APIBuilder({
  title:        'Taskcluster GitHub API Documentation',
  description: [
    'The github service is responsible for creating tasks in reposnse',
    'to GitHub events, and posting results to the GitHub UI.',
    '',
    'This document describes the API end-point for consuming GitHub',
    'web hooks, as well as some useful consumer APIs.',
    '',
    'When Github forbids an action, this service returns an HTTP 403',
    'with code ForbiddenByGithub.',
  ].join('\n'),
  serviceName: 'github',
  apiVersion: 'v1',
  context: ['Builds', 'OwnersDirectory', 'monitor', 'publisher', 'cfg', 'ajv', 'github'],
  errorCodes: {
    ForbiddenByGithub: 403,
  },
});

// Export API
module.exports = builder;

/** Define tasks */
builder.declare({
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
    msg.body = body;

    switch (eventType) {

      case 'pull_request':
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.action = body.action;
        msg.details = getPullRequestDetails(body);
        msg.installationId = body.installation.id;
        publisherKey = 'pullRequest';
        msg.tasks_for = 'github-pull-request';
        msg.branch = body.pull_request.head.ref;
        break;

      case 'push':
        msg.organization = sanitizeGitHubField(body.repository.owner.name);
        msg.details = getPushDetails(body);
        msg.installationId = body.installation.id;
        publisherKey = 'push';
        msg.tasks_for = 'github-push';
        msg.branch = body.ref.split('/').slice(2).join('/');
        break;

      case 'ping':
        return resolve(res, 200, 'Received ping event!');

      case 'release':
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.details = getReleaseDetails(body);
        msg.installationId = body.installation.id;
        publisherKey = 'release';
        msg.tasks_for = 'github-release';
        msg.branch = body.release.target_commitish;
        break;

      case 'integration_installation':
        // Creates a new entity or overwrites an existing one
        await this.OwnersDirectory.create({
          installationId: body.installation.id,
          owner: body.installation.account.login,
        }, true);
        return resolve(res, 200, 'Created table row!');

      default:
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
  let userDetails = (await instGithub.users.getById({id: headUser})).data;
  msg.details['event.head.user.email'] = this.ajv.validate({type: 'string', format: 'email'}, userDetails.email)
    ? userDetails.email
    : msg.details['event.head.user.login'].replace(/\[bot\]$/, '') + '@users.noreply.github.com';
  msg.repository = sanitizeGitHubField(body.repository.name);
  msg.eventId = eventId;

  debug('Beginning publishing event message on pulse.');
  await this.publisher[publisherKey](msg);
  debug('Finished Publishing event message on pulse.');
  res.status(204).send();
});

builder.declare({
  method:     'get',
  route:      '/builds',
  name:       'builds',
  title:      'List of Builds',
  stability:  'experimental',
  output:     'build-list.yml',
  query: {
    continuationToken: Entity.continuationTokenPattern,
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

builder.declare({
  name: 'badge',
  title: 'Latest Build Status Badge',
  description: [
    'Checks the status of the latest build of a given branch',
    'and returns corresponding badge svg.',
  ].join('\n'),
  stability: 'experimental',
  method: 'get',
  route: '/repository/:owner/:repo/:branch/badge.svg',
}, async function(req, res) {
  // Extract owner, repo and branch from request into variables
  let {owner, repo, branch} = req.params;

  // This has nothing to do with user input, so we should be safe
  let fileConfig = {
    root : __dirname + '/../assets/',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  };

  let instGithub = await installationAuthenticate(owner, this.OwnersDirectory, this.github);

  if (instGithub) {
    try {
      let status = await findTCStatus(instGithub, owner, repo, branch, this.cfg);

      if (status) {
        // If we got a status, send a corresponding image.
        return res.sendFile(status.state + '.svg', fileConfig);
      } else {
        // otherwise, it's a commit without a TC status, which probably means a new repo
        return res.sendFile('newrepo.svg', fileConfig);
      }
    } catch (e) {
      if (e.code < 500) {
        return res.sendFile('error.svg', fileConfig);
      }
      throw e;
    }
  } else {
    return res.sendFile('newrepo.svg', fileConfig);
  }
});

builder.declare({
  name: 'repository',
  title: 'Get Repository Info',
  description: [
    'Returns any repository metadata that is',
    'useful within Taskcluster related services.',
  ].join('\n'),
  stability: 'experimental',
  method: 'get',
  route: '/repository/:owner/:repo',
  output: 'repository.yml',
}, async function(req, res) {
  // Extract owner and repo from request into variables
  let {owner, repo} = req.params;

  let instGithub = await installationAuthenticate(owner, this.OwnersDirectory, this.github);

  if (instGithub) {
    try {
      let reposList = await instGithub.apps.getInstallationRepositories({});

      while (true) {
        let installed = reposList.data.repositories.map(repo => repo.name).indexOf(repo);
        if (installed !== -1) {
          return res.reply({installed: true});
        }
        if (instGithub.hasNextPage(reposList)) {
          reposList = await instGithub.getNextPage(reposList);
        } else {
          return res.reply({installed: false});
        }
      }

    } catch (e) {
      if (e.code > 400 && e.code < 500) {
        return res.reply({installed: false});
      }
      throw e;
    }
  }
  return res.reply({installed: false});
});

builder.declare({
  name: 'latest',
  title: 'Latest Status for Branch',
  description: [
    'For a given branch of a repository, this will always point',
    'to a status page for the most recent task triggered by that',
    'branch.',
    '',
    'Note: This is a redirect rather than a direct link.',
  ].join('\n'),
  stability: 'experimental',
  method: 'get',
  route: '/repository/:owner/:repo/:branch/latest',
}, async function(req, res) {
  // Extract owner, repo and branch from request into variables
  let {owner, repo, branch} = req.params;

  let instGithub = await installationAuthenticate(owner, this.OwnersDirectory, this.github);

  // Get task group ID
  if (instGithub) {
    try {
      let status = await findTCStatus(instGithub, owner, repo, branch, this.cfg);

      return res.redirect(status.target_url);
    } catch (e) {
      debug(`Error creating link: ${JSON.stringify(e)}`);
      await this.monitor.reportError(e);
      return res.status(500).send();
    }
  }
  return res.status(404).send();
});

builder.declare({
  name: 'createStatus',
  title: 'Post a status against a given changeset',
  description: [
    'For a given changeset (SHA) of a repository, this will attach a "commit status"',
    'on github. These statuses are links displayed next to each revision.',
    'The status is either OK (green check) or FAILURE (red cross), ',
    'made of a custom title and link.',
  ].join('\n'),
  stability: 'experimental',
  method: 'post',
  // route and input (schema) matches github API
  // https://developer.github.com/v3/repos/statuses/#create-a-status
  route: '/repository/:owner/:repo/statuses/:sha',
  input: 'create-status.yml',
  scopes: 'github:create-status:<owner>/<repo>',
}, async function(req, res) {
  // Extract owner, repo and sha from request into variables
  let {owner, repo, sha} = req.params;
  // Extract other attributes from POST attributes
  let {state, target_url, description, context} = req.body;

  let instGithub = await installationAuthenticate(owner, this.OwnersDirectory, this.github);

  if (instGithub) {
    try {
      await instGithub.repos.createStatus({
        owner,
        repo,
        sha,
        state,
        target_url,
        description,
        context: context || 'default',
      });

      return res.reply({});
    } catch (e) {
      // 403 from Github indicates this integration doesn't have permission to post this status,
      // so return that on to the user
      if (e.code === 403) {
        return res.reportError('ForbiddenByGithub',
          'Operation was forbidden by Github. The Github App may not be set up for this repo.',
          {});
      }
      debug(`Error creating status: ${JSON.stringify(e)}`);
      await this.monitor.reportError(e);
      return res.status(500).send();
    }
  }

  return res.status(404).send();
});

builder.declare({
  name: 'createComment',
  title: 'Post a comment on a given GitHub Issue or Pull Request',
  description: [
    'For a given Issue or Pull Request of a repository, this will write a new message.',
  ].join('\n'),
  stability: 'experimental',
  method: 'post',
  // route and input (schema) matches github API
  // https://developer.github.com/v3/issues/comments/#create-a-comment
  // number is a Issue or Pull request ID. Both share the same IDs set.
  route: '/repository/:owner/:repo/issues/:number/comments',
  input: 'create-comment.yml',
  scopes: 'github:create-comment:<owner>/<repo>',
}, async function(req, res) {
  // Extract owner, repo and number from request into variables
  let {owner, repo, number} = req.params;
  // Extract body from POST attributes
  let {body} = req.body;

  let instGithub = await installationAuthenticate(owner, this.OwnersDirectory, this.github);

  if (instGithub) {
    try {
      await instGithub.issues.createComment({
        owner,
        repo,
        number,
        body,
      });

      return res.reply({});
    } catch (e) {
      // 403 from Github indicates this integration doesn't have permission to post this comment,
      // so return that on to the user
      if (e.code === 403) {
        return res.reportError('ForbiddenByGithub',
          'Operation was forbidden by Github. The Github App may not be set up for this repo.',
          {});
      }
      debug(`Error creating comment: ${JSON.stringify(e)}`);
      await this.monitor.reportError(e);
      return res.status(500).send();
    }
  }

  return res.status(404).send();
});
