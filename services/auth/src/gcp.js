const builder = require('./api');
const {google} = require('googleapis');

builder.declare({
  method: 'get',
  route: '/gcp/credentials/:serviceAccount',
  name: 'gcpCredentials',
  output: 'gcp-credentials-response.yml',
  stability: 'stable',
  scopes: 'auth:gcp:access-token:<serviceAccount>',
  title: 'Get Temporary Read/Write GCP Credentials',
  description: [
    'Get temporary GCP credentials for the given serviceAccount.',
    '',
    'The call adds the necessary policy if the serviceAccount doesn\'t have it.',
    'The credentials are set to expire after an hour, but this behavior is',
    'subject to change. Hence, you should always read the `expires` property',
    'from the response, if you intend to maintain active credentials in your',
    'application.',
  ].join('\n'),
}, async function(req, res) {
  const serviceAccount = req.params.serviceAccount;
  const projectId = '-';

  if (!this.googleAuth) {
    return res.reportError(
      'InternalServerError',
      'The credentials for Google Cloud aren\'t available',
    );
  }

  const iam = google.iam({
    version: 'v1',
    auth: this.googleAuth,
  });

  // to understand the {get/set}IamPolicy calls, look at
  // https://cloud.google.com/iam/docs/creating-short-lived-service-account-credentials
  //
  // Notice that might happen that between the getIamPolicy and setIamPolicy calls,
  // a third party might change the etag, making the call to setIamPolicy fail.
  let response;
  try {
    response = await iam.projects.serviceAccounts.getIamPolicy({
      resource_: `projects/${projectId}/serviceAccounts/${serviceAccount}`,
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
  let binding = data.bindings.filter(b => b.role === 'roles/iam.serviceAccountTokenCreator');
  if (binding.length) {
    binding = binding[0];
  } else {
    binding = {
      role: 'roles/iam.serviceAccountTokenCreator',
      members: [],
    };

    data.bindings.push(binding);
  }

  const myServiceAccount = this.gcpCredentials.client_email;
  if (!binding.members.includes(`serviceAccount:${myServiceAccount}`)) {
    binding.members.push(`serviceAccount:${myServiceAccount}`);
    await iam.projects.serviceAccounts.setIamPolicy({
      resource: `projects/${projectId}/serviceAccounts/${serviceAccount}`,
      requestBody: {
        policy: data,
        updateMask: 'bindings',
      },
    });
  }

  const iamcredentials = google.iamcredentials({
    version: 'v1',
    auth: this.googleAuth,
  });

  response = await iamcredentials.projects.serviceAccounts.generateAccessToken({
    name: `projects/${projectId}/serviceAccounts/${serviceAccount}`,
    scope: [
      'https://www.googleapis.com/auth/cloud-platform',
    ],
    delegates: [],
    lifetime: '3600s',
  });

  return res.reply(response.data);
});
