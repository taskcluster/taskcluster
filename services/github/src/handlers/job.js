const assert = require('assert');
const stringify = require('fast-json-stable-stringify');
const libUrls = require('taskcluster-lib-urls');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { makeDebug } = require('./utils');
const { POLICIES } = require('./policies');

/**
 * If a .taskcluster.yml exists, attempt to turn it into a taskcluster
 * graph config, and post the initial status on github.
 **/
async function jobHandler(message) {
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
  let pullNumber = message.payload.details['event.pullNumber'];

  if (!sha) {
    // only releases lack event.head.sha
    if (message.payload.details['event.type'] !== 'release') {
      debug(`Ignoring ${message.payload.details['event.type']} event with no sha`);
      return;
    }

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
  }

  debug(`handling ${message.payload.details['event.type']} webhook for: ${organization}/${repository}@${sha}`);

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

  let groupState = 'pending';
  let taskGroupId = 'nonexistent';
  let graphConfig;

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
    });
    if (graphConfig.tasks !== undefined && !Array.isArray(graphConfig.tasks)) {
      throw new Error('tasks field  of .taskcluster.yml must be array of tasks or empty array');
    }
    if (!graphConfig.tasks || graphConfig.tasks.length === 0) {
      debug(`intree config for ${organization}/${repository}@${sha} compiled with zero tasks. Skipping.`);
      return;
    }
  } catch (e) {
    debug(`.taskcluster.yml for ${organization}/${repository}@${sha} was not formatted correctly.
      Leaving comment on Github.`);
    await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e, pullNumber });
    return;
  }

  // Checking pull request permission.
  if (message.payload.details['event.type'].startsWith('pull_request.')) {
    debug(`Checking pull request permission for ${organization}/${repository}@${sha}...`);

    debug(`Retrieving  ${organization}/${repository}@${sha}...`);
    let defaultBranch = (await instGithub.repos.get({ owner: organization, repo: repository }))
      .data
      .default_branch;

    let defaultBranchYml = await this.getYml({ instGithub, owner: organization, repo: repository, ref: defaultBranch });

    if (!defaultBranchYml) {
      debug(`${organization}/${repository} has no '.taskcluster.yml' at ${defaultBranch}.`);

      // If the repository does not contain a '.taskcluster.yml' file, collaborators should be able to test before
      // initializing.
      defaultBranchYml = { version: 1, policy: { pullRequests: POLICIES.COLLABORATORS_QUIET } };
    }

    if (this.getRepoPolicy(defaultBranchYml).startsWith(POLICIES.COLLABORATORS)) {
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

      const isCollaborator = async login => {
        return Boolean(await instGithub.repos.checkCollaborator({
          owner: organization,
          repo: repository,
          username: login,
        }).catch(e => {
          if (e.status !== 404) {
            throw e;
          }
          return false; // 404 -> false
        }));
      };

      const evt = message.payload.body;
      const opener = evt.pull_request.user.login;
      const openerIsCollaborator = await isCollaborator(opener);
      const head = evt.pull_request.head.user.login;
      const headIsCollaborator = head === opener ? openerIsCollaborator : await isCollaborator(head);
      const headIsBase = evt.pull_request.head.user.login === evt.pull_request.base.user.login;

      if (!(openerIsCollaborator && (headIsCollaborator || headIsBase))) {
        if (message.payload.details['event.type'].startsWith('pull_request.opened') && (this.getRepoPolicy(defaultBranchYml) !== POLICIES.COLLABORATORS_QUIET)) {
          let body = [
            '<details>\n',
            '<summary>No Taskcluster jobs started for this pull request</summary>\n\n',
            '```js\n',
            'The `allowPullRequests` configuration for this repository (in `.taskcluster.yml` on the',
            'default branch) does not allow starting tasks for this pull request.',
            '```\n',
            '</details>',
          ].join('\n');
          await instGithub.issues.createComment({
            owner: organization,
            repo: repository,
            issue_number: pullNumber,
            body,
          });
        }

        debug(`This user is not collaborator on ${organization}/${repository} and can't make PR@${sha}. Exiting...`);
        return;
      }
    }
  }

  let routes;
  try {
    taskGroupId = graphConfig.tasks[0].task.taskGroupId;
    routes = graphConfig.tasks[0].task.routes;
  } catch (e) {
    return await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e });
  }

  try {
    debug(`Trying to create a record for ${organization}/${repository}@${sha} (${groupState}) in github_builds table`);
    let now = new Date();
    await context.db.fns.create_github_build(
      organization,
      repository,
      sha,
      taskGroupId,
      groupState,
      now,
      now,
      message.payload.installationId,
      message.payload.details['event.type'],
      message.payload.eventId,
    );
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    const [build] = await this.context.db.fns.get_github_build(taskGroupId);
    assert.equal(build.state, groupState, `State for ${organization}/${repository}@${sha}
      already exists but is set to ${build.state} instead of ${groupState}!`);
    assert.equal(build.organization, organization);
    assert.equal(build.repository, repository);
    assert.equal(build.sha, sha);
    assert.equal(build.eventType, message.payload.details['event.type']);
    assert.equal(build.eventId, message.payload.eventId);
  }

  try {
    debug(`Creating tasks for ${organization}/${repository}@${sha} (taskGroupId: ${taskGroupId})`);
    await this.createTasks({ scopes: graphConfig.scopes, tasks: graphConfig.tasks });
  } catch (e) {
    debug(`Creating tasks for ${organization}/${repository}@${sha} failed! Leaving comment on Github.`);
    return await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e });
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

  debug(`Job handling for ${organization}/${repository}@${sha} completed.`);
}

module.exports = {
  jobHandler,
};
