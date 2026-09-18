export const gcpBuilder = builder =>
  builder.declare(
    {
      method: 'get',
      route: '/gcp/credentials/:projectId/:serviceAccount',
      name: 'gcpCredentials',
      output: 'gcp-credentials-response.yml',
      stability: 'stable',
      scopes: 'auth:gcp:access-token:<projectId>/<serviceAccount>',
      title: 'Get Temporary GCP Credentials',
      category: 'GCP Credentials',
      description: [
        'Get temporary GCP credentials for the given serviceAccount in the given project.',
        '',
        'Only preconfigured projects and serviceAccounts are allowed, as defined in the',
        'deployment of the Taskcluster services.',
        '',
        'The credentials are set to expire after an hour, but this behavior is',
        'subject to change. Hence, you should always read the `expires` property',
        'from the response, if you intend to maintain active credentials in your',
        'application.',
      ].join('\n'),
    },
    async function (req, res) {
      const serviceAccount = req.params.serviceAccount;
      const projectId = req.params.projectId;

      const project = this.gcp.projects[projectId];
      if (!project) {
        return res.reportError('ResourceNotFound', `The projectId ${projectId} is not configured`);
      }

      if (!project.allowedServiceAccounts.includes(serviceAccount)) {
        return res.reportError('InvalidRequestArguments', `The service account ${serviceAccount} isn't allowed`);
      }

      const iamcredentials = this.gcp.googleapis.iamcredentials({
        version: 'v1',
        auth: project.auth,
      });

      try {
        const response = await iamcredentials.projects.serviceAccounts.generateAccessToken({
          // NOTE: the `-` here represents the projectId, and uses the projectId
          // from project.auth, which is verified at startup.
          name: `projects/-/serviceAccounts/${serviceAccount}`,
          scope: ['https://www.googleapis.com/auth/cloud-platform'],
          delegates: [],
          lifetime: '3600s',
        });

        return res.reply(response.data);
      } catch (err) {
        return res.reportError('ResourceNotFound', err.message);
      }
    }
  );
