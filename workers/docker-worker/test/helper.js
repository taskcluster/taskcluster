const {Secrets} = require('taskcluster-lib-testing');

exports.secrets = new Secrets({
  secretName: [],
  secrets: {
    docker: [
      {env: 'DOCKER_TESTS', name: 'useDocker'},
    ],
    // creds with scope `assume:project:taskcluster:docker-worker-tester`, from
    // secret `project/taskcluster/testing/docker-worker/ci-creds` in CI.  Note that
    // this must be the same TC deployment as that used to create the values in
    // `fixtures/image_artifacts.js`.
    // TODO: (#2845) determine the precise list of scopes required
    'ci-creds': [
      {env: 'TASKCLUSTER_ROOT_URL', name: 'rootUrl'},
      {env: 'TASKCLUSTER_CLIENT_ID', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', name: 'accessToken'},
    ],
  },
});

/**
 * Get credentials and rootUrl options for creating a new client from the ci-creds secret
 */
exports.optionsFromCiCreds = () => {
  const ciCreds = exports.secrets.get('ci-creds');
  return {
    rootUrl: ciCreds.rootUrl,
    credentials: {
      clientId: ciCreds.clientId,
      accessToken: ciCreds.accessToken,
    },
  };
};
