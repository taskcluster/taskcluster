// Routing key will be in the form:
// treeherder.<version>.<user/project>|<project>.<revision>.<pushLogId/pullRequestId>
// [0] routing key prefix used for listening to only treeherder relevant messages
// [1] routing key version
// [2] in the form of user/project for github repos and just project for hg.mozilla.org
// [3] Top level revision for the push
// [4] Pull Request ID (github) or Push Log ID (hg.mozilla.org) of the push
//     Note: pushes ot a branch on github would not have a PR ID
export default function parseRoute(route) {
  let project, revision, revision_hash, pushId, version, owner, parsedProject;
  let parsedRoute = route.split('.');
  let destination = parsedRoute[0];
  // Assume it's a version 1 routing key
  if (parsedRoute.length === 3) {
    version = 'v1';
  } else {
    version = parsedRoute[1];
  }

  switch (version) {
    case 'v1':
      project = parsedRoute[1];
      revision_hash = parsedRoute[2];
      parsedProject = project;
      break;
    case 'v2':
      project = parsedRoute[2];
      revision = parsedRoute[3];
      if (project.split('/').length === 2) {
        [owner, parsedProject] = project.split('/');
      } else {
        parsedProject = project;
      }

      if (parsedRoute.length === 5) {
        pushId = parsedRoute[4];
      }
      break;
    default:
      throw new Error(
          'Unrecognized treeherder routing key format. Possible formats are:\n' +
          'v1: <treeherder destination>.<project>.<revision>\n' +
          'v2: <treeherder destination>.<version>.<user/project>|<project>.<revision>.<pushLogId/pullRequestId>' +
          `but received: ${route}`
      );
  }

  let x = {
    destination: destination,
    pushId: pushId ? parseInt(pushId) : undefined,
    project: parsedProject
  };
  if (revision) {
    x.revision = revision;
  } else {
    x.revision_hash = revision_hash;
  }

  // If both user and a project exist, treat as github, otherwise hg.mozilla.org
  if (owner && parsedProject) {
    x.owner = owner;
    x.origin = 'github.com';
  } else {
    x.origin = 'hg.mozilla.org';
  }

  return x;
}


