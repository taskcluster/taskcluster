const debug = require('debug')('taskcluster-github:github-auth');
const jwt = require('jsonwebtoken');

const retryPlugin = (octokit, options) => {

  const retries = 7;
  const baseBackoff = 100;
  const sleep = timeout => new Promise(resolve => setTimeout(resolve, timeout));

  octokit.hook.wrap('request', async (request, options) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await request(options);
      } catch (err) {
        if (attempt === retries || err.name !== 'HttpError' || err.status !== 404) {
          throw err;
        }
        debug(`404 getting retried for eventual consistency. attempt: ${attempt}`);
        await sleep(baseBackoff * Math.pow(2, attempt));
      }
    }
  });
};
const Octokit = require('@octokit/rest').plugin([retryPlugin]);

module.exports = async ({cfg}) => {
  const getAppGithub = async () => {
    const inteToken = jwt.sign(
      {iss: cfg.github.credentials.appId},
      cfg.github.credentials.privatePEM,
      {algorithm: 'RS256', expiresIn: '1m'},
    );

    return new Octokit({auth: `bearer ${inteToken}`});
  };

  const getInstallationGithub = async (inst_id) => {
    const inteGithub = await getAppGithub();
    // Authenticating as installation
    const instaToken = (await inteGithub.apps.createInstallationToken({
      installation_id: inst_id,
    })).data;
    const instaGithub = new Octokit({auth: `token ${instaToken.token}`});
    debug(`Authenticated as installation: ${inst_id}`);
    return instaGithub;
  };

  // This object insures that the authentication is delayed until we need it.
  // Also, the authentication happens not just once in the beginning, but for each request.
  return {getAppGithub, getInstallationGithub};
};
