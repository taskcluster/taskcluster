/**
 * Used to fetch shared secrets in CI that aren't specific to
 * services and clients like lib testing ones are
 */
const taskcluster = require('taskcluster-client');

const main = async () => {
  let configs;
  if (process.env.TASKCLUSTER_PROXY_URL) {
    configs = {
      rootUrl: process.env.TASKCLUSTER_PROXY_URL,
    };
  } else {
    configs = {
      rootUrl: process.env.TASKCLUSTER_ROOT_URL,
      credentials: {
        clientId: process.env.TASKCLUSTER_CLIENT_ID,
        accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN,
      },
    };
  }
  const secrets = new taskcluster.Secrets(configs);
  for (let secretName of ['project/taskcluster/testing/codecov']) {
    const { secret: results } = await secrets.get(secretName);
    console.log(Object.entries(results).map(([key, val]) => `export ${key}=${val}`).join('\n'));
  }
};

main().catch(console.error);
