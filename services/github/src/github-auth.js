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
        if (attempt < retries && err.name === 'HttpError' && (err.status >= 500 || err.status === 404)) {
          debug(`Request getting retried for eventual consistency. attempt: ${attempt}`);
          await sleep(baseBackoff * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }
  });
};
const Octokit = require('@octokit/rest').plugin([retryPlugin]);

module.exports = async ({cfg}) => {
  const keyRe = /-----BEGIN RSA PRIVATE KEY-----\n.*\n-----END RSA PRIVATE KEY-----\n?/;
  if (!keyRe.test(cfg.github.credentials.privatePEM)) {
    throw new Error(`Malformed GITHUB_PRIVATE_PEM: must match ${keyRe}`);
  }

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
