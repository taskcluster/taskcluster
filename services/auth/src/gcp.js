const builder = require('./api');
const {google} = require('googleapis');

builder.declare({
  method: 'get',
  route: '/gcp/credentials/:projectId/:serviceAccount',
  name: 'gcpCredentials',
  input: undefined,
  output: 'gcp-credentials-response.yml',
  stability: 'stable',
  scopes: 'auth:gcp:access-token:serviceAccount/<serviceAccount>',
  title: 'Get Temporary Read/Write GCP Credentials',
  description: [
    'Get temporary GCP credentials for the given projectId and serviceAccount.',
    'You can use the tag "-" to refer for the same projectId as the running auth',
    'service.',
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

  // Check that the client is authorized to get a token for the given account
  await req.authorize({serviceAccount});

  let auth = await new Promise((accept, reject) => google.auth.getApplicationDefault(
    (err, authClient) => err ? reject(err) : accept(authClient)
  ));

  auth = auth.createScoped([
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/iam',
  ]);

  const iam = google.iam('v1');

  // to understand the {get/set}IamPolicy calls, look at
  // https://cloud.google.com/iam/docs/creating-short-lived-service-account-credentials
  let response;
  try {
    response = await iam.projects.serviceAccounts.getIamPolicy({
      resource_: `projects/${projectId}/serviceAccounts/${serviceAccount}`,
      auth,
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

  if (!binding.members.includes(`serviceAccount:${this.serviceAccount}`)) {
    binding.members.push(`serviceAccount:${this.serviceAccount}`);
    await iam.projects.serviceAccounts.setIamPolicy({
      resource_: `projects/${projectId}/serviceAccounts/${serviceAccount}`,
      resource: {
        policy: data,
        updateMask: 'bindings',
      },
      auth,
    });
  }

  const iamcredentials = google.iamcredentials('v1');
  response = await iamcredentials.projects.serviceAccounts.generateAccessToken({
    name: `projects/${projectId}/serviceAccounts/${serviceAccount}`,
    auth,
    scope: [
      'https://www.googleapis.com/auth/cloud-platform',
    ],
    delegates: [],
    lifetime: '3600s',
  });

  return res.reply(response.data);
});
