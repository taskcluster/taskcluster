// Routing key will be in the form:
// treeherder.<version>.<user/project>|<project>.<revision>.<pushLogId/pullRequestId>
// [0] routing key prefix used for listening to only treeherder relevant messages
// [1] routing key version
// [2] in the form of user/project for github repos and just project for hg.mozilla.org
// [3] Top level revision for the push
// [4] Pull Request ID (github) or Push Log ID (hg.mozilla.org) of the push
//     Note: pushes ot a branch on github would not have a PR ID
module.exports = function parseRoute(route) {
  let project, revision, pushId, version, owner, parsedProject;

  let parsedRoute = route.split('.');
  let destination = parsedRoute[0];
  let version = parsedRoute[1];

  try {
    switch (version) {
      case 'v1':
	if (parsedRoute[2] != "checks") {
	  throw new Error();
        }
	organization = parsedRoute[3];
	repositorh = parsedRoute[4];
	eventType = parsedRoute[5];
	revision = parsedRoute[6];
	if (parsedRoute.length !== 7) {
          throw new Error();
	}
	break;
      default:
        throw new Error();
    }
  } catch (e) {
    throw new Error(
      'Unrecognized treeherder routing key format. Possible formats are:\n' +
      'v1: github.v1.checks.<owner>.<repository>.<event>.<revision>' +
      `but received: ${route}`
    );
  }

  return {
    destination: destination,
    organization: organization,
    repository: repository,
    sha: revision,
    eventType: eventType,
  };
};
