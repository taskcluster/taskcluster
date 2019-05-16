/**
 * Used to fetch shared secrets in CI that aren't specific to
 * services and clients like lib testing ones are
 */
const taskcluster = require('taskcluster-client');

const main = async () => {
  let secrets;
  if (process.env.TASKCLUSTER_PROXY_URL) {
    secrets = new taskcluster.Secrets({
      rootUrl: process.env.TASKCLUSTER_PROXY_URL,
    });
  } else {
    secrets = new taskcluster.Secrets({
      rootUrl: process.env.TASKCLUSTER_ROOT_URL,
      credentials: {
        clientId: process.env.TASKCLUSTER_CLIENT_ID,
        accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN,
      },
    });
  }
  const {secret: results} = await secrets.get('project/taskcluster/testing/shared');
  console.log(Object.entries(results).map(([key, val]) => `export ${key}=${val}`).join('\n'));
};

main().catch(console.error);
