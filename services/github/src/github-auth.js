const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require("@octokit/auth-app");
const { retry } = require("@octokit/plugin-retry");

const PluggedOctokit = Octokit.plugin(retry);

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

module.exports = async ({ cfg, monitor }) => {
  const privatePEM = getPrivatePEM(cfg);

  const OctokitOptions = {
    log: {
      debug: message => monitor.debug(message),
      info: message => monitor.info(message),
      warn: message => monitor.warning(message),
      error: message => monitor.err(message),
    },
    retry: {
      // 404 and 401 are both retried because they can occur spuriously, likely due to MySQL db replication
      // delays at GitHub.
      doNotRetry: [400, 403],
    },
  };

  const getAppGithub = async () => {
    return new PluggedOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId: cfg.github.credentials.appId,
        privateKey: privatePEM,
      },
      ...OctokitOptions,
    });
  };

  const getInstallationGithub = async (inst_id) => {
    try {
      const inteGithub = await getAppGithub();
      // Authenticating as installation
      const instaToken = (await inteGithub.apps.createInstallationAccessToken({
        installation_id: inst_id,
      })).data;
      const instaGithub = new PluggedOctokit({
        auth: `token ${instaToken.token}`,
        ...OctokitOptions,
      });
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
