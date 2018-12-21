let debug = require('debug')('taskcluster-github:github-auth');
let Github = require('github');
let Promise = require('promise');
let jwt = require('jsonwebtoken');

module.exports = async ({cfg}) => {
  let github = new Github({
    promise: Promise,
  });

  // This object insures that the authentication is delayed until we need it.
  // Also, the authentication happens not just once in the beginning, but for each request.
  return {
    getInstallationGithub: async (inst_id) => {
      // Authenticating as integration
      let inteToken = jwt.sign(
        {iss: cfg.github.credentials.integrationId},
        cfg.github.credentials.privatePEM,
        {algorithm: 'RS256', expiresIn: '1m'},
      );
      try {
        github.authenticate({type: 'integration', token: inteToken});
      } catch (e) {
        debug('Authentication as integration failed!');
        throw e;
      }

      // Authenticating as installation
      var instaToken = await github.integrations.createInstallationToken({
        installation_id: inst_id,
      });
      let gh = new Github({promise: Promise});
      try {
        gh.authenticate({type: 'token', token: instaToken.token});
        debug(`Authenticated as installation: ${inst_id}`);
      } catch (e) {
        debug('Authentication as integration failed!');
        throw e;
      }
      return gh;
    },
  };
};
