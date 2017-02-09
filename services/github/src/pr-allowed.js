let yaml = require('js-yaml');

const DEFAULT_POLICY = 'collaborators';

async function prAllowed(options) {
  switch (await getRepoPolicy(options)) {
    case 'collaborators':
      return await isCollaborator(options);

    case 'public':
      return true;

    default:
      return false;
  }
}

/**
 * Get the repo's "policy" on pull requests, by fetching .taskcluster.yml from the default
 * branch, parsing it, and looking at its `allowPullRequests`.
 */
async function getRepoPolicy({login, organization, repository, instGithub, debug}) {
  // first, get the repository's default branch
  let repoInfo = await instGithub.repos.get({owner: organization, repo: repository});
  let branch = repoInfo.default_branch;

  // load .taskcluster.yml from that branch
  let taskclusterYml;
  try {
    let content = await instGithub.repos.getContent({
      owner: organization,
      repo: repository,
      path: '.taskcluster.yml',
      ref: branch,
    });
    taskclusterYml = yaml.safeLoad(new Buffer(content.content, 'base64').toString());
  } catch (e) {
    if (e.code === 404) {
      return DEFAULT_POLICY;
    }
    throw e;
  }

  // consult its `allowPullRequests` field
  return taskclusterYml['allowPullRequests'] || DEFAULT_POLICY;
}

async function isCollaborator({login, organization, repository, sha, instGithub, debug}) {
  // GithubAPI's collaborator check returns an error if a user isn't
  // listed as a collaborator.
  try {
    await instGithub.repos.checkCollaborator({
      owner: organization,
      repo: repository,
      collabuser: login,
    });
    // No error, the user is a collaborator
    debug(`Checking collaborator: ${login} is a collaborator on ${organization}/${repository}: True!`);
    return true;
  } catch (e) {
    // a 404 means the user is not a collaborator
    if (e.code !== 404) {
      throw e;
    }
  }
  return false;
}

module.exports = prAllowed;

// for testing..
module.exports.getRepoPolicy = getRepoPolicy;
module.exports.isCollaborator = isCollaborator;
