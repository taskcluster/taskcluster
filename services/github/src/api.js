import { APIBuilder, paginateResults } from '@taskcluster/lib-api';
import _ from 'lodash';
import libUrls from 'taskcluster-lib-urls';
import yaml from 'js-yaml';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;
const assetsPath = path.join(__dirname, '/../assets/');

import {
  EVENT_TYPES,
  CHECK_RUN_ACTIONS,
  PUBLISHERS,
  GITHUB_TASKS_FOR,
  GITHUB_BUILD_STATES,
} from './constants.js';

import { shouldSkipCommit, shouldSkipPullRequest, checkGithubSignature, shouldSkipComment, getTaskclusterCommand } from './utils.js';
import { getEventPayload } from './fake-payloads.js';

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

function getIssueCommentDetails(eventData) {
  return {
    'event.type': `issue_comment.${eventData.action}`,
    'event.head.user.login': eventData.sender.login,
    'taskcluster_comment': getTaskclusterCommand(eventData.comment),
    // rest of the details would be fetched in the handler
  };
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
    statuses = (await github.repos.listCommitStatusesForRef({
      owner,
      repo,
      ref: branch,
      request: { retries: 1 },
    })).data;
  } catch (e) {
    // github sends 422 when branch doesn't exist
    if (e.code === 404 || e.code === 422) {
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
    checks = (await github.checks.listForRef({ owner, repo, ref: branch, request: { retries: 1 } })).data.check_runs;
  } catch (e) {
    if (e.code === 404 || e.code === 422) {
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
  context: ['db', 'monitor', 'publisher', 'cfg', 'ajv', 'github', 'queueClient', 'intree', 'schemaset'],
  errorCodes: {
    ForbiddenByGithub: 403,
  },
});

// Export API
export default builder;

/** Define tasks */
builder.declare({
  method: 'post',
  route: '/github',
  input: 'github-webhook-event.yml',
  name: 'githubWebHookConsumer',
  scopes: null,
  title: 'Consume GitHub WebHook',
  category: 'Github Service',
  stability: 'stable',
  noPublish: true, // Webhook endpoint is server-side only, not called by clients
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
  const installationId = body.installation && body.installation.id;

  let webhookSecrets = this.cfg.webhook.secret;
  // sha256 version is recommended by github but if it's missing we fallback to sha1
  // sha256 can be missing in some older Github Enterprise versions
  // checkGithubSignature function will handle both cases
  let xHubSignature = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];

  if (xHubSignature && !webhookSecrets) {
    return resolve(res, 400, 'Server is not setup to handle secrets');
  } else if (webhookSecrets && !xHubSignature) {
    return resolve(res, 400, 'Request missing a secret');
  } else if (webhookSecrets && xHubSignature) {
    const bodyPayload = JSON.stringify(body);
    // Verify that our payload is legitimate
    if (!webhookSecrets.some(webhookSecret => checkGithubSignature(webhookSecret, bodyPayload, xHubSignature))) {
      // let sentry know about this
      await this.monitor.reportError(
        new Error('X-hub-signature does not match'), {
          xHubSignature,
          installationId,
          event: req.headers['x-github-event'],
          eventId: req.headers['x-github-delivery'],
        },
      );
      return resolve(res, 403, 'X-hub-signature does not match; bad webhook secret?');
    }
  }

  let msg = {};
  let publisherKey = '';

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
        if (shouldSkipPullRequest(body)) {
          debugMonitor.debug({
            message: 'Skipping pull_request event',
            body,
          });
          return resolve(res, 200, 'Skipping pull_request event');
        }

        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.action = body.action;
        msg.details = getPullRequestDetails(body);
        msg.installationId = installationId;
        publisherKey = PUBLISHERS.PULL_REQUEST;
        msg.tasks_for = GITHUB_TASKS_FOR.PULL_REQUEST;
        msg.branch = body.pull_request.head.ref;
        break;

      case EVENT_TYPES.PUSH:
        if (shouldSkipCommit(body)) {
          debugMonitor.debug({
            message: 'Skipping push event',
            body,
          });
          return resolve(res, 200, 'Skipping push event');
        }
        msg.organization = sanitizeGitHubField(body.repository.owner.name);
        msg.details = getPushDetails(body);
        msg.installationId = installationId;
        publisherKey = PUBLISHERS.PUSH;
        msg.tasks_for = GITHUB_TASKS_FOR.PUSH;
        msg.branch = body.ref.split('/').slice(2).join('/');
        break;

      case EVENT_TYPES.ISSUE_COMMENT:
        // Comments on PRs can trigger tasks, too
        // For this to work, there should be a `/taskcluster cmd` in the comment
        // Plus repository should have a `.taskcluster.yml` in default branch with
        // "policy.allowComments: collaborators" in it
        // Message is being processed in the same way as PULL_REQUEST
        // and missing data would be fetched from the PR

        if (shouldSkipComment(body)) {
          debugMonitor.debug({
            message: 'Skipping issue_comment event',
            body,
          });
          return resolve(res, 200, 'Skipping issue_comment event');
        }

        publisherKey = PUBLISHERS.PULL_REQUEST;
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.installationId = installationId;
        msg.tasks_for = GITHUB_TASKS_FOR.ISSUE_COMMENT;
        msg.action = body.action; // not a PR action, but a comment action
        msg.branch = 'unknown'; // not yet available at this point
        msg.details = getIssueCommentDetails(body);
        break;

      case EVENT_TYPES.PING:
        return resolve(res, 200, 'Received ping event!');

      case EVENT_TYPES.RELEASE:
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.details = getReleaseDetails(body);
        msg.installationId = installationId;
        publisherKey = PUBLISHERS.RELEASE;
        msg.tasks_for = GITHUB_TASKS_FOR.RELEASE;
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

        if (body?.sender?.type?.toLowerCase() === 'bot') {
          // When someone reruns task in taskcluster that was previously completed, we can't change check run state
          // instead, we are calling github's rerequestRun that will reset completion status and dispatch this event,
          // But since we know that task was already restarted, there is no need to publish this rerun message
          // see handlers/status.js
          debugMonitor.debug({
            message: `This rerun was triggered by taskcluster bot and should not be processed: ${body?.sender?.login} (${body?.sender?.id})`,
            body,
          });
          return resolve(res, 200, 'Skipping rerequested event started by bot');
        }

        publisherKey = PUBLISHERS.RERUN;
        msg.organization = sanitizeGitHubField(body.repository.owner.login);
        msg.details = getRerunDetails(body);
        msg.tasks_for = GITHUB_TASKS_FOR.PUSH;
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
  const headUser = msg.details['event.head.user.login'].toString();
  const defaultEmail = msg.details['event.head.user.login'].replace(/\[bot\]$/, '') + '@users.noreply.github.com';
  let resolvedEmail = defaultEmail;

  try {
    const { data: userDetails } = await instGithub.users.getByUsername({ username: headUser });
    if (this.ajv.validate({ type: 'string', format: 'email' }, userDetails.email)) {
      resolvedEmail = userDetails.email;
    }
  } catch (err) {
    if (err.status !== 404 && err.code !== 404) {
      throw err;
    }
    debugMonitor.debug({
      message: `GitHub user ${headUser} not found when resolving email, falling back to noreply`,
      status: err.status || err.code,
      fallbackEmail: defaultEmail,
    });
  }

  msg.details['event.head.user.email'] = resolvedEmail;
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
    pullRequest: /^([0-9]*)$/,
  },
  description: [
    'A paginated list of builds that have been run in',
    'Taskcluster. Can be filtered on various git-specific',
    'fields.',
  ].join('\n'),
}, async function(req, res) {
  const { organization, repository, sha, pullRequest } = req.query;
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
  if (pullRequest && !repository) {
    return res.reportError('InputError',
      'Must provide `repository` if querying `pullRequest`',
      {});
  }

  let { continuationToken, rows: builds } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_github_builds_pr(
      size,
      offset,
      organization || null,
      repository || null,
      sha || null,
      pullRequest ? parseInt(pullRequest, 10) : null,
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
        pullRequestNumber: entry.pull_request_number || undefined,
      };
    }),
  });
});

builder.declare({
  method: 'post',
  route: '/builds/:owner/:repo/cancel',
  name: 'cancelBuilds',
  scopes: 'github:cancel-builds:<owner>:<repo>',
  title: 'Cancel repository builds',
  stability: 'stable',
  category: 'Github Service',
  output: 'build-list.yml',
  query: {
    sha: /./,
    pullRequest: /^([0-9]*)$/,
  },
  description: [
    'Cancel all running Task Groups associated with given repository and sha or pullRequest number',
  ].join('\n'),
}, async function(req, res) {
  const { owner: organization, repo: repository } = req.params;
  const { sha, pullRequest } = req.query;

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
  if (pullRequest && !repository) {
    return res.reportError('InputError',
      'Must provide `repository` if querying `pullRequest`',
      {});
  }

  const debugMon = this.monitor.childMonitor({ organization, repository, sha, pullRequest });
  const builds = await this.db.fns.get_pending_github_builds(
    null, null, organization, repository, sha, pullRequest,
  );

  if (!builds.length) {
    debugMon.debug('No builds found to cancel');
    return res.reportError('ResourceNotFound', 'No cancellable builds found', {});
  }

  const taskGroupIds = builds.map(build => build.task_group_id);
  debugMon.debug(`Cancelling ${taskGroupIds.length} task groups: ${taskGroupIds.join(', ')}`);

  try {
    const limitedQueueClient = this.queueClient.use({
      authorizedScopes: [
        `assume:repo:github.com/${organization}/${repository}:*`,
        'queue:seal-task-group:taskcluster-github/*',
        'queue:cancel-task-group:taskcluster-github/*',
      ],
    });

    await Promise.all(taskGroupIds.map(taskGroupId => limitedQueueClient.sealTaskGroup(taskGroupId)));
    await Promise.all(taskGroupIds.map(taskGroupId => limitedQueueClient.cancelTaskGroup(taskGroupId)));
    await Promise.all(taskGroupIds.map(taskGroupId => this.db.fns.set_github_build_state(
      taskGroupId, GITHUB_BUILD_STATES.CANCELLED,
    )));
  } catch (err) {
    await this.monitor.reportError(err);
    if (err.code === 'InsufficientScopes') {
      return res.reportError('InsufficientScopes', err.message, {});
    }
    return res.reportError('InputError', err.message, {});
  }

  return res.reply({
    builds: builds.map(entry => {
      return {
        organization: entry.organization,
        repository: entry.repository,
        sha: entry.sha,
        state: GITHUB_BUILD_STATES.CANCELLED, // no need to refetch from db, we just updated it
        taskGroupId: entry.task_group_id,
        eventType: entry.event_type,
        eventId: entry.event_id,
        created: entry.created.toJSON(),
        updated: entry.updated.toJSON(),
        pullRequestNumber: entry.pull_request_number || undefined,
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
    root: assetsPath,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Security-Policy': "default-source 'none'; style-source 'unsafe-inline'",
      'X-Taskcluster-Status': '',
    },
  };

  let instGithub = await installationAuthenticate(owner, this.db, this.github);

  if (!instGithub) {
    fileConfig.headers['X-Taskcluster-Status'] = 'nogithub';
    return res.sendFile('newrepo.svg', fileConfig);
  }

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
    res.reportError('InternalError', e.message, {});
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

  if (!instGithub) {
    return res.reply({ installed: false });
  }

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
    res.reportError('InternalError', e.message, {});
  }
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
    try {
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
    } catch (e) {
      if (e.code < 500) {
        return res.reportError('ResourceNotFound', 'Status not found', {});
      }
      return res.reportError('InternalError', e.message, {});
    }
  }

  return res.reportError('ResourceNotFound', 'Status not found', {});
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

      return res.reportError('InternalServerError', e.message, {});
    }
  }

  return res.reportError('ResourceNotFound', 'Installation not found', {});
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
      return res.reportError('InternalServerError', e.message, {});
    }
  }

  return res.reportError('ResourceNotFound', 'Issue not found', {});
});

builder.declare({
  name: 'renderTaskclusterYml',
  title: 'Render .taskcluster.yml file',
  description: [
    'This endpoint allows to render the .taskcluster.yml file for a given event or payload.',
    'This is useful to preview the result of the .taskcluster.yml file before pushing it to',
    'the repository.',
    'Read more about the .taskcluster.yml file in the [documentation](https://docs.taskcluster.net/docs/reference/integrations/github/taskcluster-yml-v1)',
  ].join('\n'),
  stability: 'experimental',
  method: 'post',
  category: 'Github Service',
  route: '/taskcluster-yml',
  input: 'render-taskcluster-yml-input.yml',
  output: 'render-taskcluster-yml-output.yml',
  scopes: null,
}, async function(req, res) {
  let {
    body,
    organization = 'taskcluster',
    repository = 'testing',
    fakeEvent: {
      type: fakeEventType,
      action: fakeEventAction,
      overrides: fakeEventData,
    } = {},
  } = req.body;

  const fakeEventToFnMap = {
    'github-push': getPushDetails,
    'github-pull-request': getPullRequestDetails,
    'github-pull-request-untrusted': getPullRequestDetails,
    'github-release': getReleaseDetails,
    'github-issue-comment': getIssueCommentDetails,
  };

  const branch = fakeEventData?.branch || 'main';
  const fakePayload = getEventPayload(
    fakeEventType, fakeEventAction, organization, repository, branch, fakeEventData,
  );

  const payload = {
    organization,
    repository,
    installationId: Math.floor(Math.random() * 100000),
    eventId: `evt-${organization}-${repository}-${fakeEventType}-${fakeEventAction}`,
    branch,
    tasks_for: fakeEventType,
    fakeEventAction,
    body: fakePayload,
    details: fakeEventToFnMap[fakeEventType](fakePayload),
    ...fakeEventData,
  };

  // simulate what handlers/job.js:219 would do with injecting extra variable
  if (fakeEventType === 'github-issue-comment') {
    payload.body.taskcluster_comment = payload.details.taskcluster_comment;
  }

  const { rootUrl } = this.cfg.taskcluster;
  const validator = await this.schemaset.validator(rootUrl);

  try {
    const tcYml = yaml.load(body);
    const { tasks, scopes } = this.intree({
      config: tcYml,
      payload,
      validator,
      schema: {
        0: libUrls.schema(rootUrl, 'github', 'v1/taskcluster-github-config.yml'),
        1: libUrls.schema(rootUrl, 'github', 'v1/taskcluster-github-config.v1.yml'),
      },
    });

    return res.reply({ tasks, scopes });
  } catch (e) {
    return res.reportError('InvalidInput', e.message, {});
  }
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
