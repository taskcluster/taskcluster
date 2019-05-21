const builder = require('./api');

builder.declare({
  method: 'get',
  route: '/gcp/credentials/:projectId/:serviceAccount',
  name: 'gcpCredentials',
  output: 'gcp-credentials-response.yml',
  stability: 'stable',
  scopes: 'auth:gcp:access-token:<projectId>/<serviceAccount>',
  title: 'Get Temporary GCP Credentials',
  description: [
    'Get temporary GCP credentials for the given serviceAccount in the given project.',
    '',
    'Only preconfigured projects are allowed.  Any serviceAccount in that project may',
    'be used.',
    '',
    'The call adds the necessary policy if the serviceAccount doesn\'t have it.',
    'The credentials are set to expire after an hour, but this behavior is',
    'subject to change. Hence, you should always read the `expires` property',
    'from the response, if you intend to maintain active credentials in your',
    'application.',
  ].join('\n'),
}, async function(req, res) {
  const serviceAccount = req.params.serviceAccount;
  const projectId = req.params.projectId;

  if (!this.gcp.credentials) {
    return res.reportError('ResourceNotFound', 'GCP credentials are not available');
  }

  if (projectId !== this.gcp.credentials.project_id) {
    return res.reportError(
      'ResourceNotFound',
      `The projectId ${projectId} is not configured`,
    );
  }

  const iam = this.gcp.googleapis.iam({
    version: 'v1',
    auth: this.gcp.auth,
  });

  // to understand the {get/set}IamPolicy calls, look at
  // https://cloud.google.com/iam/docs/creating-short-lived-service-account-credentials
  //
  // Notice that might happen that between the getIamPolicy and setIamPolicy calls,
  // a third party might change the etag, making the call to setIamPolicy fail.
  let response;
  try {
    response = await iam.projects.serviceAccounts.getIamPolicy({
      // NOTE: the `-` here represents the projectId, and uses the projectId
      // from this.gcp.auth, which is why we verified those match above.
      resource_: `projects/-/serviceAccounts/${serviceAccount}`,
    });
  } catch (e) {
    return res.reportError(
      'ResourceNotFound',
      `The service account ${serviceAccount} was not found: ${e}`,
    );
  }

  const data = response.data;
  if (data.bindings === undefined) {
    data.bindings = [];
  }
  let binding = data.bindings.find(b => b.role === 'roles/iam.serviceAccountTokenCreator');
  if (!binding) {
    binding = {
      role: 'roles/iam.serviceAccountTokenCreator',
      members: [],
    };

    data.bindings.push(binding);
  }

  const myServiceAccount = this.gcp.credentials.client_email;
  if (!binding.members.includes(`serviceAccount:${myServiceAccount}`)) {
    binding.members.push(`serviceAccount:${myServiceAccount}`);
    await iam.projects.serviceAccounts.setIamPolicy({
      // NOTE: the `-` here represents the projectId, and uses the projectId
      // from this.gcp.auth, which is why we verified those match above.
      resource: `projects/-/serviceAccounts/${serviceAccount}`,
      requestBody: {
        policy: data,
        updateMask: 'bindings',
      },
    });
  }

  const iamcredentials = this.gcp.googleapis.iamcredentials({
    version: 'v1',
    auth: this.gcp.auth,
  });

  response = await iamcredentials.projects.serviceAccounts.generateAccessToken({
    // NOTE: the `-` here represents the projectId, and uses the projectId
    // from this.gcp.auth, which is why we verified those match above.
    name: `projects/-/serviceAccounts/${serviceAccount}`,
    scope: [
      'https://www.googleapis.com/auth/cloud-platform',
    ],
    delegates: [],
    lifetime: '3600s',
  });

  return res.reply(response.data);
});
