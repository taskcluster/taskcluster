// Routing key will be in the form:
// treeherder.<user/project>|<project>.<revision>.<pushLogId/pullRequestId>
// [0] routing key prefix used for listening to only treeherder relevant messages
// [1] in the form of user/project for github repos and just project for hg.mozilla.org
// [2] Top level revision for the push
// [3] Pull Request ID (github) or Push Log ID (hg.mozilla.org) of the push
//     Note: pushes ot a branch on github would not have a PR ID
export default function parseRoute(route) {
  if (route.match(/\./g).length < 2) {
    throw new Error("Route is not of an expected format. Expected: <prefix>.<project>.<revision>");
  }

  let [destination, project, revision, pushId] = route.split('.');
  let x = {
    destination: destination,
    revision: revision,
    pushId: pushId ? parseInt(pushId) : undefined
  };

  let [owner, p] = project.split('/');
  // If both user and a project exist, treat as github, otherwise hg.mozilla.org
  if (p) {
    x.owner = owner;
    x.origin = 'github.com';
    x.project = p;
  } else {
    x.origin = 'hg.mozilla.org';
    x.project = project;
  }

  return x;
}


