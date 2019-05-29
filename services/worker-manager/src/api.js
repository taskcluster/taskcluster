const APIBuilder = require('taskcluster-lib-api');

let builder = new APIBuilder({
  title: 'Taskcluster Worker Manager',
  description: [
    'This service manages workers, including provisioning for dynamic workertypes.',
  ].join('\n'),
  serviceName: 'worker-manager',
  apiVersion: 'v1',
  params: {
    workerTypeName: /^[a-zA-Z0-9-_]{1,38}\/[a-z]([-a-z0-9]{0,36}[a-z0-9])?$/,
  },
  context: [
    'WorkerType',
    'providers',
    'publisher',
  ],
});

module.exports = builder;

builder.declare({
  method: 'put',
  route: '/workertype/:workerTypeName',
  name: 'createWorkerType',
  title: 'Create WorkerType',
  stability: APIBuilder.stability.experimental,
  input: 'create-workertype-request.yml',
  output: 'workertype-full.yml',
  scopes: {AllOf: [
    'worker-manager:create-worker-type:<workerTypeName>',
    'worker-manager:provider:<providerId>',
  ]},
  description: [
    'Create a new workertype. If the workertype already exists, this will throw an error.',
  ].join('\n'),
}, async function(req, res) {
  const {workerTypeName} = req.params;
  const input = req.body;
  const providerId = input.providerId;

  await req.authorize({workerTypeName, providerId});

  const provider = this.providers.get(providerId);
  if (!provider) {
    return res.reportError('InputError', 'Invalid Provider', {
      providerId,
      validProviderIds: this.providers.validProviderIds(),
    });
  }

  // This has been validated at the api level to ensure that it
  // is valid config for at least one of our providers but
  // we check here to see that the config matches the config for the configured provider
  const error = provider.validate(input.config);
  if (error) {
    return res.reportError('InputValidationError', error);
  }

  const now = new Date();
  let workerType;

  const definition = {
    workerTypeName,
    providerId,
    previousProviderIds: [],
    description: input.description,
    config: input.config,
    created: now,
    lastModified: now,
    owner: input.owner,
    emailOnError: input.emailOnError,
    providerData: {},
    scheduledForDeletion: false,
  };

  try {
    workerType = await this.WorkerType.create(definition);
  } catch (err) {
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }
    workerType = await this.WorkerType.load({workerTypeName});

    if (!workerType.compare(definition)) {
      return res.reportError('RequestConflict', 'WorkerType already exists', {});
    }
  }
  await this.publisher.workerTypeCreated({workerTypeName, providerId});
  res.reply(workerType.serializable());
});

builder.declare({
  method: 'post',
  route: '/workertype/:workerTypeName',
  name: 'updateWorkerType',
  title: 'Update WorkerType',
  stability: APIBuilder.stability.experimental,
  input: 'create-workertype-request.yml',
  output: 'workertype-full.yml',
  scopes: {AllOf: [
    'worker-manager:update-worker-type:<workerTypeName>',
    'worker-manager:provider:<providerId>',
  ]},
  description: [
    'Given an existing workertype definition, this will modify it and return the new definition.',
  ].join('\n'),
}, async function(req, res) {
  const {workerTypeName} = req.params;
  const input = req.body;
  const providerId = input.providerId;

  await req.authorize({workerTypeName, providerId});

  const provider = this.providers.get(providerId);
  if (!provider) {
    return res.reportError('InputError', 'Invalid Provider', {
      providerId,
      validProviderIds: this.providers.validProviderIds(),
    });
  }

  const error = provider.validate(input.config);
  if (error) {
    return res.reportError('InputValidationError', error);
  }

  const workerType = await this.WorkerType.load({
    workerTypeName,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }

  const previousProviderId = workerType.providerId;

  await workerType.modify(wt => {
    wt.config = input.config;
    wt.description = input.description;
    wt.providerId = providerId;
    wt.owner = input.owner;
    wt.emailOnError = input.emailOnError;
    wt.lastModified = new Date();

    if (previousProviderId !== providerId && !wt.previousProviderIds.includes(previousProviderId)) {
      wt.previousProviderIds.push(previousProviderId);
    }
  });

  await this.publisher.workerTypeUpdated({workerTypeName, providerId, previousProviderId});
  res.reply(workerType.serializable());
});

builder.declare({
  method: 'get',
  route: '/workertype/:workerTypeName',
  name: 'workerType',
  title: 'Get WorkerType',
  stability: APIBuilder.stability.experimental,
  output: 'workertype-full.yml',
  description: [
    'Fetch an existing workertype defition.',
  ].join('\n'),
}, async function(req, res) {
  const {workerTypeName} = req.params;

  const workerType = await this.WorkerType.load({
    workerTypeName,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }
  res.reply(workerType.serializable());
});

builder.declare({
  method: 'delete',
  route: '/workertype/:workerTypeName',
  name: 'deleteWorkerType',
  title: 'Delete WorkerType',
  scopes: 'worker-manager:delete-worker-type:<workerTypeName>',
  stability: APIBuilder.stability.experimental,
  description: [
    'Delete an existing workertype definition.',
  ].join('\n'),
}, async function(req, res) {
  const {workerTypeName} = req.params;

  const workerType = await this.WorkerType.load({
    workerTypeName,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }

  await workerType.modify(wt => {
    wt.scheduledForDeletion = true;
  });

  await this.publisher.workerTypeDeleted({workerTypeName, providerId: workerType.providerId});
  return res.reply();
});

builder.declare({
  method: 'get',
  route: '/workertypes',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listWorkerTypes',
  title: 'List All WorkerTypes',
  stability: APIBuilder.stability.experimental,
  output: 'workertype-list.yml',
  description: [
    'Get the list of all the existing workertypes',
  ].join('\n'),
}, async function(req, res) {
  const { continuationToken } = req.query;
  const limit = parseInt(req.query.limit || 100, 10);
  const scanOptions = {
    continuation: continuationToken,
    limit,
  };

  const data = await this.WorkerType.scan({}, scanOptions);
  const result = {
    workerTypes: data.entries.map(e => e.serializable()),
  };

  if (data.continuation) {
    result.continuationToken = data.continuation;
  }
  return res.reply(result);
});

/*
 * ************** BELOW HERE LIVE PROVIDER ENDPOINTS **************
 */

builder.declare({
  method: 'post',
  route: '/credentials/google/:workerTypeName',
  name: 'credentialsGoogle',
  title: 'Google Credentials',
  stability: APIBuilder.stability.experimental,
  input: 'credentials-google-request.yml',
  output: 'temp-creds-response.yml',
  description: [
    'Get Taskcluster credentials for a worker given an Instance Identity Token',
  ].join('\n'),
}, async function(req, res) {
  const {workerTypeName} = req.params;

  try {
    const workerType = await this.WorkerType.load({workerTypeName});
    return res.reply(await this.providers.get(workerType.providerId).verifyIdToken({
      token: req.body.token,
      workerType,
    }));
  } catch (err) {
    // We will internally record what went wrong and report back something generic
    this.monitor.reportError(err, 'warning');
    return res.reportError('InputError', 'Invalid Token', {});
  }
});

/*
 * ************** THIS SECTION FOR PROVIDER ENDPOINTS **************
 */
