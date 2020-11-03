const jwt = require('jsonwebtoken');
let { Octokit } = require('@octokit/rest');

const retryPlugin = (octokit, options) => {

  const retries = 7;
  const baseBackoff = 100;
  const sleep = timeout => new Promise(resolve => setTimeout(resolve, timeout));

  octokit.hook.wrap('request', async (request, options) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await request(options);
      } catch (err) {
        // 404 and 401 are both retried because they can occur spuriously, likely due to MySQL db replication
        // delays at GitHub.
        if (attempt < retries && err.name === 'HttpError' && (err.status >= 500 || err.status === 401 || err.status === 404)) {
          await sleep(baseBackoff * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }
  });
};
Octokit = Octokit.plugin(retryPlugin);

const getPrivatePEM = cfg => {
  const keyRe = /-----BEGIN RSA PRIVATE KEY-----(\n|\\n).*(\n|\\n)-----END RSA PRIVATE KEY-----(\n|\\n)?/s;
  const privatePEM = cfg.github.credentials.privatePEM;
  if (!keyRe.test(privatePEM)) {
    throw new Error(`Malformed GITHUB_PRIVATE_PEM: must match ${keyRe}; ` +
      `got a value of length ${privatePEM.length}`);
  }

  // sometimes it's easier to provide this config value with embedded backslash-n characters
  // than to convince everything to correctly handle newlines.  So, we'll be friendly to that
  // arrangement, too.
  return privatePEM.replace(/\\n/g, '\n');
};

module.exports = async ({ cfg }) => {
  const privatePEM = getPrivatePEM(cfg);

  const getAppGithub = async () => {
    const inteToken = jwt.sign(
      { iss: cfg.github.credentials.appId },
      privatePEM,
      { algorithm: 'RS256', expiresIn: '1m' },
    );

    return new Octokit({ auth: `bearer ${inteToken}` });
  };

  const getInstallationGithub = async (inst_id) => {
    try {
      const inteGithub = await getAppGithub();
      // Authenticating as installation
      const instaToken = (await inteGithub.apps.createInstallationAccessToken({
        installation_id: inst_id,
      })).data;
      const instaGithub = new Octokit({ auth: `token ${instaToken.token}` });
      return instaGithub;
    } catch (err) {
      err.installationId = inst_id;
      throw err;
    }
  };

  // This object insures that the authentication is delayed until we need it.
  // Also, the authentication happens not just once in the beginning, but for each request.
  return { getAppGithub, getInstallationGithub };
};

module.exports.getPrivatePEM = getPrivatePEM; // for testing
