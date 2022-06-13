const crypto = require('crypto');
const { APIBuilder, paginateResults } = require('taskcluster-lib-api');
const _ = require('lodash');
const { EVENT_TYPES, CHECK_RUN_ACTIONS, PUBLISHERS } = require('./constants');

// Strips/replaces undesirable characters which GitHub allows in
// repository/organization names (notably .)
function sanitizeGitHubField(field) {
  return field.replace(/[^a-zA-Z0-9-_\.]/gi, '').replace(/\./g, '%');
}

// Reduce a pull request WebHook's data to only fields needed to checkout a
// revision
//
// See https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#pullrequestevent
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

// See https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#push
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

    'event.type': isTagEvent ? 'tag' : 'push',
  };
  if (isTagEvent) {
    details['event.head.tag'] = refName;
  } else {
    details['event.base.repo.branch'] = refName;
    details['event.head.repo.branch'] = refName;

  }
  return details;
}

// See https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#release
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

// See https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#check_run
function getRerunDetails(eventData) {
  // This is mostly for the v0 compatability, which is not supported anymore
  // and will be removed in the future.
  return {
    'event.head.user.login': eventData.sender.login,
    'event.head.repo.name': eventData.repository.name,
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
  const secret = crypto.randomBytes(16).toString('hex');
  let h1 = crypto.createHmac('sha1', secret).update(sOne);
  let h2 = crypto.createHmac('sha1', secret).update(sTwo);
  return h1.digest('hex') === h2.digest('hex');
}

/***
 Helper function to look up repo owner in the Azure table to get installation ID,
 and authenticate with GitHub using that ID.

 Receives owner's name, the Azure table, and github object.
 Returns either authenticated github object or null
***/
async function installationAuthenticate(owner, db, github) {
  // Look up the installation ID in Azure. If no such owner in the table, no error thrown
  let [ownerInfo] = await db.fns.get_github_integration(owner);
  if (ownerInfo) {
    return await github.getInstallationGithub(ownerInfo.installation_id);
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
  const botName = configuration.app.botName;
  const username = botName.endsWith('[bot]') ? botName : `${botName}[bot]`;
  const taskclusterBot = (await github.users.getByUsername({ username })).data;
  // Statuses is an array of status objects, where we find the relevant status
  let statuses;

  try {
    statuses = (await github.repos.listCommitStatusesForRef({ owner, repo, ref: branch })).data;
  } catch (e) {
    if (e.code === 404) {
      return undefined;
    }
    throw e;
  }
  return statuses.find(statusObject => statusObject.creator.id === taskclusterBot.id);
}

/***
 Helper function that returns all checks on the latest ref of a repository
 branch created by taskcluster's bot.
***/
async function findTCChecks(github, owner, repo, branch, configuration) {
  let checks;

  try {
    checks = (await github.checks.listForRef({ owner, repo, ref: branch })).data.check_runs;
  } catch (e) {
    if (e.code === 404) {
      return [];
    }
    throw e;
  }
  return checks.filter(checkObject => checkObject.app.id === parseInt(configuration.github.credentials.appId, 10));
}

/** API end-point for version v1/
 */
let builder = new APIBuilder({
  title: 'GitHub Service',
  description: [
    'The github service is responsible for creating tasks in response',
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
  context: ['db', 'monitor', 'publisher', 'cfg', 'ajv', 'github'],
  errorCodes: {
    ForbiddenByGithub: 403,
  },
});

// Export API
module.exports = builder;

/** Define tasks */
builder.declare({
  method: 'post',
  route: '/github',
  name: 'githubWebHookConsumer',
  scopes: null,
  title: 'Consume GitHub WebHook',
  category: 'Github Service',
  stability: 'stable',
  description: [
    'Capture a GitHub event and publish it via pulse, if it\'s a push,',
    'release, check run or pull request.',
  ].join('\n'),
}, async function(req, res) {
  let eventId = req.headers['x-github-delivery'];

  const debugMonitor = this.monitor.childMonitor({ eventId });

  function resolve(res, status, message) {
    if (status !== 200) {
      debugMonitor.debug({ message, status });
    }
    return res.status(status).send(message);
  }

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

  const installationId = body.installation && body.installation.id;
  this.monitor.log.webhookReceived({ eventId, eventType, installationId });

  debugMonitor.debug({
    message: 'Github webhook payload',
    eventType,
    installationId,
    body,
  });

  try {
    msg.body = body;

    switch (eventType) {

      case EVENT_TYPES.PULL_REQUEST:
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.action = body.action;
        msg.details = getPullRequestDetails(body);
        msg.installationId = installationId;
        publisherKey = PUBLISHERS.PULL_REQUEST;
        msg.tasks_for = 'github-pull-request';
        msg.branch = body.pull_request.head.ref;
        break;

      case EVENT_TYPES.PUSH:
        msg.organization = sanitizeGitHubField(body.repository.owner.name);
        msg.details = getPushDetails(body);
        msg.installationId = installationId;
        publisherKey = PUBLISHERS.PUSH;
        msg.tasks_for = 'github-push';
        msg.branch = body.ref.split('/').slice(2).join('/');
        break;

      case EVENT_TYPES.PING:
        return resolve(res, 200, 'Received ping event!');

      case EVENT_TYPES.RELEASE:
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.details = getReleaseDetails(body);
        msg.installationId = installationId;
        publisherKey = PUBLISHERS.RELEASE;
        msg.tasks_for = 'github-release';
        msg.branch = body.release.target_commitish;
        break;

      case EVENT_TYPES.INSTALLATION:
        // Creates a new entity or overwrites an existing one
        await this.db.fns.upsert_github_integration(
          body.installation.account.login,
          installationId,
        );
        return resolve(res, 200, 'Created table row!');

      case EVENT_TYPES.CHECK_RUN:
        // We only want to check if re-run was requested
        if (body.action !== CHECK_RUN_ACTIONS.REREQUESTED) {
          return resolve(res, 400, 'Only rerequested for check runs is supported');
        }

        publisherKey = PUBLISHERS.RERUN;
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.details = getRerunDetails(body);
        msg.tasks_for = 'github-push';
        msg.installationId = installationId;
        msg.checkRunId = body.check_run.id;
        msg.checkSuiteId = body.check_run.check_suite.id;
        break;

      default:
        return resolve(res, 400, 'No publisher available for X-GitHub-Event: ' + eventType);
    }
  } catch (e) {
    e.webhookPayload = body;
    e.eventId = eventId;
    throw e;
  }

  // Authenticating as installation.
  const instGithub = await this.github.getInstallationGithub(installationId);

  // Not all webhook payloads include an e-mail for the user who triggered an event
  let headUser = msg.details['event.head.user.login'].toString();
  let userDetails = (await instGithub.users.getByUsername({ username: headUser })).data;
  msg.details['event.head.user.email'] = this.ajv.validate({ type: 'string', format: 'email' }, userDetails.email)
    ? userDetails.email
    : msg.details['event.head.user.login'].replace(/\[bot\]$/, '') + '@users.noreply.github.com';
  msg.repository = sanitizeGitHubField(body.repository.name);
  msg.eventId = eventId;

  await this.publisher[publisherKey](msg);
  res.status(204).send();
});

builder.declare({
  method: 'get',
  route: '/builds',
  name: 'builds',
  scopes: 'github:list-builds',
  title: 'List of Builds',
  stability: 'stable',
  category: 'Github Service',
  output: 'build-list.yml',
  query: {
    ...paginateResults.query,
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
  const { organization, repository, sha } = req.query;
  if (repository && !organization) {
    return res.reportError('InputError',
      'Must provide `organization` if querying `repository`',
      {});
  }
  if (sha && !repository) {
    return res.reportError('InputError',
      'Must provide `repository` if querying `sha`',
      {});
  }
  let { continuationToken, rows: builds } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_github_builds(
      size,
      offset,
      organization || null,
      repository || null,
      sha || null,
    ),
  });

  return res.reply({
    continuationToken,
    builds: builds.map(entry => {
      return {
        organization: entry.organization,
        repository: entry.repository,
        sha: entry.sha,
        state: entry.state,
        taskGroupId: entry.task_group_id,
        eventType: entry.event_type,
        eventId: entry.event_id,
        created: entry.created.toJSON(),
        updated: entry.updated.toJSON(),
      };
    }),
  });
});

builder.declare({
  name: 'badge',
  scopes: 'github:get-badge:<owner>:<repo>:<branch>',
  title: 'Latest Build Status Badge',
  description: [
    'Checks the status of the latest build of a given branch',
    'and returns corresponding badge svg.',
  ].join('\n'),
  stability: 'experimental',
  category: 'Github Service',
  method: 'get',
  route: '/repository/:owner/:repo/:branch/badge.svg',
}, async function(req, res) {
  // Extract owner, repo and branch from request into variables
  let { owner, repo, branch } = req.params;

  // This has nothing to do with user input, so we should be safe
  let fileConfig = {
    root: __dirname + '/../assets/',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Security-Policy': "default-source 'none'; style-source 'unsafe-inline'",
      'X-Taskcluster-Status': '',
    },
  };

  let instGithub = await installationAuthenticate(owner, this.db, this.github);

  if (instGithub) {
    try {
      let state;

      let status = await findTCStatus(instGithub, owner, repo, branch, this.cfg);
      if (status) {
        state = status.state;
      }

      const checks = await findTCChecks(instGithub, owner, repo, branch, this.cfg);

      // List of conclusions: https://docs.github.com/en/rest/reference/checks#check-runs
      const SOFT_STATES = ['pending', 'timed_out', 'cancelled', 'skipped', 'stale', 'timed_out', 'action_required', 'neutral'];
      const checksSoftStates = [];

      for (const check of checks) {
        // If any check failed, mark the whole status as failed
        if (check.conclusion === 'failure') {
          state = 'failure';
          break;
        }

        // If there's any check pending, set the state to pending after looping unless there was a failure
        if (SOFT_STATES.includes(check.conclusion)) {
          checksSoftStates.push(check.conclusion);
          continue;
        }

        // If the current state is success or pending and a check was successful, mark state as success.
        // This might get reset after the loop if we find any other pending check.
        if (state !== 'failure' && check.conclusion === 'success') {
          state = 'success';
        }
      }

      if (state !== 'failure' && checksSoftStates.length > 0) {
        state = checksSoftStates[0];
      }

      if (state) {
        // If we got a status, send a corresponding image.
        fileConfig.headers['X-Taskcluster-Status'] = state;
        return res.sendFile(state + '.svg', fileConfig);
      } else {
        // otherwise, it's a commit without a TC status, which probably means a new repo
        fileConfig.headers['X-Taskcluster-Status'] = 'newrepo';
        return res.sendFile('newrepo.svg', fileConfig);
      }
    } catch (e) {
      if (e.code < 500) {
        fileConfig.headers['X-Taskcluster-Status'] = 'error';
        return res.sendFile('error.svg', fileConfig);
      }
      throw e;
    }
  } else {
    fileConfig.headers['X-Taskcluster-Status'] = 'nogithub';
    return res.sendFile('newrepo.svg', fileConfig);
  }
});

builder.declare({
  name: 'repository',
  scopes: 'github:get-repository:<owner>:<repo>',
  title: 'Get Repository Info',
  description: [
    'Returns any repository metadata that is',
    'useful within Taskcluster related services.',
  ].join('\n'),
  stability: 'experimental',
  method: 'get',
  category: 'Github Service',
  route: '/repository/:owner/:repo',
  output: 'repository.yml',
}, async function(req, res) {
  // Extract owner and repo from request into variables
  let { owner, repo } = req.params;

  let instGithub = await installationAuthenticate(owner, this.db, this.github);

  if (instGithub) {
    try {
      for await (const response of instGithub.paginate.iterator(
        instGithub.apps.listReposAccessibleToInstallation, {})) {
        let installed = response.data.map(repo => repo.name).indexOf(repo);
        if (installed !== -1) {
          return res.reply({ installed: true });
        }
      }
      // no early return -> not installed
      return res.reply({ installed: false });
    } catch (e) {
      if (e.code > 400 && e.code < 500) {
        return res.reply({ installed: false });
      }
      throw e;
    }
  }
  return res.reply({ installed: false });
});

builder.declare({
  name: 'latest',
  scopes: 'github:latest-status:<owner>:<repo>:<branch>',
  title: 'Latest Status for Branch',
  description: [
    'For a given branch of a repository, this will always point',
    'to a status page for the most recent task triggered by that',
    'branch.',
    '',
    'Note: This is a redirect rather than a direct link.',
  ].join('\n'),
  stability: 'stable',
  category: 'Github Service',
  method: 'get',
  route: '/repository/:owner/:repo/:branch/latest',
}, async function(req, res) {
  // Extract owner, repo and branch from request into variables
  let { owner, repo, branch } = req.params;

  let instGithub = await installationAuthenticate(owner, this.db, this.github);

  // Get task group ID
  if (instGithub) {
    // First inspect the status API. This will be set if consumer repos are
    // using status reporting (the default).
    const status = await findTCStatus(instGithub, owner, repo, branch, this.cfg);
    if (status) {
      return res.redirect(status.target_url);
    }

    // Next inspect the checks API. This will be set if consumer repos have
    // opted into the checks-v2 reporting.
    const checkRuns = await findTCChecks(instGithub, owner, repo, branch, this.cfg);

    if (checkRuns.length > 0) {
      // Sort the array of runs from smallest to largest id, this should yield
      // the Decision task.
      let run = checkRuns.sort((a, b) => a.id - b.id)[0];
      return res.redirect(run.html_url);
    }

    // Otherwise there is no status available for the given branch.
    return res.reportError('ResourceNotFound', 'Status not found', {});
  }
});

builder.declare({
  name: 'createStatus',
  title: 'Post a status against a given changeset',
  description: [
    'For a given changeset (SHA) of a repository, this will attach a "commit status"',
    'on github. These statuses are links displayed next to each revision.',
    'The status is either OK (green check) or FAILURE (red cross),',
    'made of a custom title and link.',
  ].join('\n'),
  stability: 'experimental',
  method: 'post',
  category: 'Github Service',
  // route and input (schema) matches github API
  // https://developer.github.com/v3/repos/statuses/#create-a-status
  route: '/repository/:owner/:repo/statuses/:sha',
  input: 'create-status.yml',
  scopes: 'github:create-status:<owner>/<repo>',
}, async function(req, res) {
  // Extract owner, repo and sha from request into variables
  let { owner, repo, sha } = req.params;
  // Extract other attributes from POST attributes
  let { state, target_url, description, context } = req.body;

  let instGithub = await installationAuthenticate(owner, this.db, this.github);

  if (instGithub) {
    try {
      await instGithub.repos.createCommitStatus({
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
  stability: 'stable',
  method: 'post',
  category: 'Github Service',
  // route and input (schema) matches github API
  // https://developer.github.com/v3/issues/comments/#create-a-comment
  // number is a Issue or Pull request ID. Both share the same IDs set.
  route: '/repository/:owner/:repo/issues/:number/comments',
  input: 'create-comment.yml',
  scopes: 'github:create-comment:<owner>/<repo>',
}, async function(req, res) {
  // Extract owner, repo and number from request into variables
  let { owner, repo, number } = req.params;
  // Extract body from POST attributes
  let { body } = req.body;

  let instGithub = await installationAuthenticate(owner, this.db, this.github);

  if (instGithub) {
    try {
      await instGithub.issues.createComment({
        owner,
        repo,
        issue_number: number,
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
      await this.monitor.reportError(e);
      return res.status(500).send();
    }
  }

  return res.status(404).send();
});

builder.declare({
  method: 'get',
  route: '/__heartbeat__',
  name: 'heartbeat',
  scopes: null,
  category: 'Monitoring',
  stability: 'stable',
  title: 'Heartbeat',
  description: [
    'Respond with a service heartbeat.',
    '',
    'This endpoint is used to check on backing services this service',
    'depends on.',
  ].join('\n'),
}, function(_req, res) {
  // TODO: add implementation
  res.reply({});
});
