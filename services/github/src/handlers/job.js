import assert from 'assert';
import stringify from 'fast-json-stable-stringify';
import taskcluster from '@taskcluster/client';
import libUrls from 'taskcluster-lib-urls';
import { UNIQUE_VIOLATION } from '@taskcluster/lib-postgres';
import { makeDebug, isCollaborator } from './utils.js';
import { POLICIES, ALLOW_COMMENT_POLICIES } from './policies.js';
import { GITHUB_TASKS_FOR } from '../constants.js';

/**
 * Helper function to create a github_build_pr record for a given taskGroupId
 * Returns the created or existing build record
 */
async function createGithubBuildRecord({
  context,
  organization,
  repository,
  sha,
  taskGroupId,
  groupState,
  installationId,
  eventType,
  eventId,
  pullNumber,
  debug,
}) {
  try {
    debug(`Trying to create a record for ${organization}/${repository}@${sha} (${groupState}) with taskGroupId=${taskGroupId}`);
    const now = new Date();
    await context.db.fns.create_github_build_pr(
      organization,
      repository,
      sha,
      taskGroupId,
      groupState,
      now,
      now,
      installationId,
      eventType,
      eventId,
      pullNumber,
    );
    debug(`Created github_build_pr record with taskGroupId=${taskGroupId}`);
    return {
      organization,
      repository,
      sha,
      task_group_id: taskGroupId,
      event_type: eventType,
      event_id: eventId,
      pull_number: pullNumber,
    };
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    debug(`github_build_pr record already exists for taskGroupId ${taskGroupId}`);
    const [build] = await context.db.fns.get_github_build_pr(taskGroupId);
    assert.equal(build.state, groupState, `State for ${organization}/${repository}@${sha}
      already exists but is set to ${build.state} instead of ${groupState}!`);
    assert.equal(build.organization, organization);
    assert.equal(build.repository, repository);
    assert.equal(build.sha, sha);
    assert.equal(build.event_type, eventType);
    assert.equal(build.event_id, eventId);
    return build;
  }
}

/**
 * If a .taskcluster.yml exists, attempt to turn it into a taskcluster
 * graph config, and post the initial status on github.
 **/
export async function jobHandler(message) {
  const { eventId, installationId } = message.payload;
  let debug = makeDebug(this.monitor, { eventId, installationId });

  let context = this.context;

  // Authenticating as installation.
  let instGithub = await context.github.getInstallationGithub(installationId);

  // We must attempt to convert the sanitized fields back to normal here.
  // Further discussion of how to deal with this cleanly is in
  // https://github.com/taskcluster/taskcluster-github/issues/52
  message.payload.organization = message.payload.organization.replace(/%/g, '.');
  message.payload.repository = message.payload.repository.replace(/%/g, '.');
  let organization = message.payload.organization;
  let repository = message.payload.repository;
  let sha = message.payload.details['event.head.sha'];
  debug = debug.refine({ owner: organization, repo: repository, sha });
  let pullNumber = message.payload.details['event.pullNumber'] || message.payload.body.number;

  debug(`handling ${message.payload.details['event.type']} webhook for: ${organization}/${repository}@${sha}`);

  if (!sha) {
    // only releases and issue_comment lack event.head.sha
    if (message.payload.details['event.type'] === 'release') {
      debug('Trying to get release commit info in job handler...');
      let commitInfo = await instGithub.repos.getCommit({
        headers: { accept: 'application/vnd.github.3.sha' },
        owner: organization,
        repo: repository,
        // fetch the target_commitish for the release, as the tag may not
        // yet have been created
        ref: message.payload.body.release.target_commitish,
      });
      sha = commitInfo.data;
    } else if (message.payload.details['event.type'].startsWith('issue_comment')) {
      debug.refine({ comment: JSON.stringify(message.payload.body.comment.body) })(
        `Trying to pull request details for comment: ${message.payload.details.taskcluster_comment}`,
      );
      const pr = await instGithub.pulls.get({
        owner: organization,
        repo: repository,
        pull_number: message.payload.body.issue.number,
      });
      pullNumber = pr.data.number;
      sha = pr.data.head.sha;

      // extend details body with pull request details for .taskcluster.yml
      message.payload.body.pull_request = pr.data;

      debug = debug.refine({ sha });
      debug(`Got sha ${sha} for pull request ${pullNumber}`);
    } else {
      debug(`Ignoring ${message.payload.details['event.type']} event with no sha`);
      return;
    }
  }

  let defaultBranch = (await instGithub.repos.get({ owner: organization, repo: repository }))
    .data
    .default_branch;

  // Try to fetch a .taskcluster.yml file for every request
  debug(`Trying to fetch the YML for ${organization}/${repository}@${sha}`);
  let repoconf;
  try {
    repoconf = await this.getYml({ instGithub, owner: organization, repo: repository, ref: sha });
  } catch (e) {
    if (e.name === 'YAMLException') {
      return await this.createExceptionComment({
        debug,
        instGithub,
        organization,
        repository,
        sha,
        error: e,
        pullNumber,
      });
    }
    throw e;
  }
  if (!repoconf) {
    debug(`${organization}/${repository} has no '.taskcluster.yml' at ${sha}. Skipping.`);
    return;
  }

  // Checking pull request permission.
  if (message.payload.details['event.type'].startsWith('pull_request.')) {
    debug(`Checking pull request permission for ${organization}/${repository}@${sha}...`);

    let defaultBranchYml = await this.getYml({ instGithub, owner: organization, repo: repository, ref: defaultBranch });

    if (!defaultBranchYml) {
      debug(`${organization}/${repository} has no '.taskcluster.yml' at ${defaultBranch}.`);

      // If the repository does not contain a '.taskcluster.yml' file, collaborators should be able to test before
      // initializing.
      defaultBranchYml = { version: 1, policy: { pullRequests: POLICIES.COLLABORATORS_QUIET } };
    }

    const repoPolicy = this.getRepoPolicy(defaultBranchYml);

    // There are four usernames associated with a PR action:
    //  - pull_request.user.login -- the user who opened the PR
    //  - pull_request.head.user.login -- the username or org name for the repo from which changes are pulled
    //  - pull_request.base.user.login -- the username or org name for the repo into which changes will merge
    //  - sender.login -- the user who clicked the button to trigger this action
    //
    // The "collaborators" and "collaborators_quiet" policies require:
    //  - pull_request.user.login is a collaborator; AND
    //  - pull_request.head.user.login is
    //    - a collaborator OR
    //    - the same as pull_request.base.user.login
    //
    // Meaning that the PR must have been opened by a collaborator and be merging code from a collaborator
    // or from the repo against which the PR is filed.
    //
    // The "public_restricted" policy uses the same criteria as above, but will assume a separate role
    // for a PR associated with a collaborator or one that is public.

    const evt = message.payload.body;
    const opener = evt.pull_request.user.login;
    const openerIsCollaborator = await isCollaborator(instGithub, organization, repository, opener);
    const head = evt.pull_request.head.user.login;
    const headIsCollaborator = head === opener ? openerIsCollaborator :
      await isCollaborator(instGithub, organization, repository, head);
    const headIsBase = evt.pull_request.head.user.login === evt.pull_request.base.user.login;
    const isPullRequestTrusted = openerIsCollaborator && (headIsCollaborator || headIsBase);

    if (!isPullRequestTrusted) {
      if (repoPolicy.startsWith(POLICIES.COLLABORATORS)) {
        if (message.payload.details['event.type'].startsWith('pull_request.opened') && (repoPolicy !== POLICIES.COLLABORATORS_QUIET)) {
          await this.createComment({
            instGithub, organization, repository, pullNumber, sha, debug,
            body: {
              summary: 'No Taskcluster jobs started for this pull request',
              details: [
                'The `allowPullRequests` configuration for this repository ',
                '(in `.taskcluster.yml` on the default branch) does not allow ',
                'starting tasks for this pull request.',
              ].join(''),
            },
          });
        }

        debug(`This user is not a collaborator on ${organization}/${repository} and can't make PR@${sha}. Exiting...`);
        return;
      } else if (repoPolicy === POLICIES.PUBLIC_RESTRICTED) {
        message.payload.tasks_for = GITHUB_TASKS_FOR.PULL_REQUEST_UNTRUSTED;
      }
    }
  }

  // checking comment permissions
  if (message.payload.details['event.type'].startsWith('issue_comment')) {
    debug(`Checking comment permission for ${organization}/${repository}@${sha}...`);

    let defaultBranchYml = await this.getYml({ instGithub, owner: organization, repo: repository, ref: defaultBranch });
    if (!defaultBranchYml) {
      debug(`${organization}/${repository} has no '.taskcluster.yml' at ${defaultBranch}. Skipping.`);
      return;
    }
    const allowCommentsPolicy = this.getRepoAllowCommentsPolicy(defaultBranchYml);

    const validCommentPolicies = Object.values(ALLOW_COMMENT_POLICIES);
    if (!validCommentPolicies.includes(allowCommentsPolicy)) {
      debug(`allowComments: "${allowCommentsPolicy}" policy does not allow comments. Allowed: ${validCommentPolicies}. Skipping.`);
      await this.createComment({
        instGithub, organization, repository, pullNumber, sha, debug,
        body: {
          summary: 'No Taskcluster jobs started for comment',
          details: [
            'The `policy.allowComments` configuration for this repository ',
            '(in `.taskcluster.yml` on the default branch) does not allow ',
            'starting tasks from comments.',
          ].join(''),
        },
      });
      await this.addCommentReaction({
        instGithub, organization, repository,
        commentId: message.payload.body.comment.id,
        reaction: 'confused',
      });
      return;
    }

    const commenterName = message.payload.body.comment.user.login;
    const commenterIsCollaborator = await isCollaborator(instGithub, organization, repository, commenterName);

    if (!commenterIsCollaborator) {
      debug(`User ${commenterName} is not a collaborator on ${organization}/${repository}. Skipping.`);
      await this.createComment({
        instGithub, organization, repository, pullNumber, sha, debug,
        body: {
          summary: 'No Taskcluster jobs started for this pull request',
          details: `Cannot create tasks from comments. User "${commenterName}" is not a collaborator.`,
        },
      });
      await this.addCommentReaction({
        instGithub, organization, repository,
        commentId: message.payload.body.comment.id,
        reaction: 'eyes',
      });
      return;
    }
    // expose command as "event.taskcluster_comment"
    message.payload.body.taskcluster_comment = message.payload.details.taskcluster_comment;
  }

  let groupState = 'pending';
  let graphConfig;
  let now = new Date().toJSON();

  // Now we can try processing the config and kicking off a task.
  try {
    graphConfig = this.intree({
      config: repoconf,
      payload: message.payload,
      validator: context.validator,
      schema: {
        0: libUrls.schema(this.rootUrl, 'github', 'v1/taskcluster-github-config.yml'),
        1: libUrls.schema(this.rootUrl, 'github', 'v1/taskcluster-github-config.v1.yml'),
      },
      now,
    });
    if (graphConfig.tasks !== undefined && !Array.isArray(graphConfig.tasks)) {
      throw new Error('tasks field  of .taskcluster.yml must be array of tasks or empty array');
    }

    if (
      (!graphConfig.tasks || graphConfig.tasks.length === 0) &&
      (!graphConfig.hooks || graphConfig.hooks.length === 0)
    ) {
      debug(`intree config for ${organization}/${repository}@${sha} compiled with no tasks or hooks. Skipping.`);

      // If triggered by a comment, let everyone know we couldn't create tasks
      if (message.payload.details['event.type'].startsWith('issue_comment')) {
        await this.createComment({
          instGithub, organization, repository, pullNumber, sha, debug,
          body: {
            summary: 'No Taskcluster jobs started for this command',
            details: 'Task graph produced empty list of tasks and hooks',
          },
        });
      }
      return;
    }
  } catch (e) {
    debug(`.taskcluster.yml for ${organization}/${repository}@${sha} was not formatted correctly.
      Leaving comment on Github.`);
    await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e, pullNumber });
    return;
  }

  // Trigger hooks (if present)
  let hasHookFailures = false;
  if (graphConfig.hooks && graphConfig.hooks.length > 0) {
    debug('Triggering hooks from .taskcluster.yml');

    await Promise.all(graphConfig.hooks.map(async hook => {
      // Pre-allocate taskId to use as taskGroupId for the hook
      // This eliminates the race condition where task status events arrive before the record exists
      const taskGroupId = taskcluster.slugid();

      const build = await createGithubBuildRecord({
        context,
        organization,
        repository,
        sha,
        taskGroupId,
        groupState,
        installationId: message.payload.installationId,
        eventType: message.payload.details['event.type'],
        eventId: message.payload.eventId,
        pullNumber,
        debug,
      });

      try {
        const payload = {
          context: hook.context || {},
          event: message.payload.body,
          now,
          taskcluster_root_url: context.cfg.taskcluster.rootUrl,
          tasks_for: message.payload.tasks_for,
          taskId: taskGroupId,
        };

        const returnedTaskId = await this.triggerHook({
          scopes: graphConfig.scopes,
          name: hook.name,
          payload,
        });

        if (returnedTaskId) {
          debug.refine({ taskId: returnedTaskId })(`Hook ${hook.name} triggered successfully, taskId: ${returnedTaskId}`);
          if (graphConfig.autoCancelPreviousChecks !== false) {
            if (pullNumber || message.payload.body.ref !== defaultBranch) {
              await this.cancelPreviousTaskGroups({ instGithub, debug, newBuild: build });
            }
          }
        }

        if (!returnedTaskId) {
          // Hook rendered to null (no task created) - clean up the github_build record
          debug(`Hook ${hook.name} rendered to null, no task created - cleaning up github_build record`);
          await context.db.fns.delete_github_build(taskGroupId);
          debug(`Deleted github_build record for taskGroupId ${taskGroupId}`);
        }
      } catch (e) {
        hasHookFailures = true;
        debug(`Triggering hook ${hook.name} for ${organization}/${repository}@${sha} failed! Leaving comment on Github.`);
        await context.db.fns.delete_github_build(taskGroupId);
        debug(`Deleted github_build record for taskGroupId ${taskGroupId}`);
        await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e, pullNumber });
      }
    }));
  }

  // Create tasks (if present)
  if (graphConfig.tasks && graphConfig.tasks.length > 0) {
    let routes;
    let taskGroupId;

    try {
      routes = graphConfig.tasks[0].task.routes;
      taskGroupId = graphConfig.tasks[0].task.taskGroupId;
    } catch (e) {
      return await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e });
    }

    let build = await createGithubBuildRecord({
      context,
      organization,
      repository,
      sha,
      taskGroupId,
      groupState,
      installationId: message.payload.installationId,
      eventType: message.payload.details['event.type'],
      eventId: message.payload.eventId,
      pullNumber,
      debug,
    });

    try {
      debug(`Creating tasks for ${organization}/${repository}@${sha} (taskGroupId: ${taskGroupId})`);
      await this.createTasks({ scopes: graphConfig.scopes, tasks: graphConfig.tasks });
    } catch (e) {
      debug(`Creating tasks for ${organization}/${repository}@${sha} failed! Leaving comment on Github.`);
      return await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e });
    }

    // Only cancel previous tasks after we have successfully created new ones.
    // Cancel existing builds for non-default branches.
    if (graphConfig.autoCancelPreviousChecks !== false) {
      if (pullNumber || message.payload.body.ref !== defaultBranch) {
        await this.cancelPreviousTaskGroups({ instGithub, debug, newBuild: build });
      }
    }

    try {
      debug(`Publishing status exchange for ${organization}/${repository}@${sha} (${groupState})`);
      await context.publisher.taskGroupCreationRequested({
        taskGroupId,
        organization: organization.replace(/\./g, '%'),
        repository: repository.replace(/\./g, '%'),
      }, routes);
    } catch (e) {
      debug(`Failed to publish to taskGroupCreationRequested exchange.
      Parameters: ${taskGroupId}, ${organization}, ${repository}, ${routes}`);
      debug(`Stack: ${e.stack}`);
      return debug(`Failed to publish to taskGroupCreationRequested exchange
      for ${organization}/${repository}@${sha} with the error: ${stringify(e, null, 2)}`);
    }
  }

  if (message.payload.details['event.type'].startsWith('issue_comment')) {
    // let them know we are doing something
    let reaction = hasHookFailures ? "confused" : "+1";
    await this.addCommentReaction({
      instGithub,
      organization,
      repository,
      commentId: message.payload.body.comment.id,
      reaction,
    });
  }

  debug(`Job handling for ${organization}/${repository}@${sha} completed.`);
}

export default jobHandler;
