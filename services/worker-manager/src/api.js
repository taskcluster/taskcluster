const APIBuilder = require('taskcluster-lib-api');

let builder = new APIBuilder({
  title: 'Taskcluster Worker Manager',
  description: [
    'This service manages workers, including provisioning',
  ].join('\n'),
  serviceName: 'worker-manager',
  apiVersion: 'v1',
  context: [
    'WorkerType',
    'providers',
  ],
});

module.exports = builder;

builder.declare({
  method: 'put',
  route: '/workertype/:name',
  name: 'createWorkerType',
  title: 'Create WorkerType',
  stability: APIBuilder.stability.experimental,
  input: 'create-workertype-request.yml',
  output: 'workertype-full.yml',
  scopes: {AllOf: [
    'worker-manager:create-worker-type:<name>',
    'worker-manager:provider:<provider>',
  ]},
  description: [
    'Create a new workertype. If the workertype already exists, this will throw an error.',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;
  const input = req.body;
  const providerName = input.provider;

  await req.authorize({name, provider: providerName});

  const provider = this.providers[providerName];
  if (!provider) {
    return res.reportError('InputError', 'Invalid Provider', {
      provider: providerName,
      validProviders: Object.keys(this.providers),
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

  try {
    workerType = await this.WorkerType.create({
      name,
      provider: providerName,
      description: input.description,
      config: input.config,
      created: now,
      lastModified: now,
      owner: input.owner,
      providerData: {},
      scheduledForDeletion: false,
    });
  } catch (err) {
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }
    workerType = await this.WorkerType.load({name});

    // TODO: Do this whole thing with deep compare and include config!
    if (workerType.provider !== providerName ||
      workerType.description !== input.description ||
      workerType.created.getTime() !== now.getTime() ||
      workerType.lastModified.getTime() !== now.getTime() ||
      workerType.owner !== input.owner
    ) {
      return res.reportError('RequestConflict', 'WorkerType already exists', {});
    }
  }
  res.reply(workerType.serializable());
});

builder.declare({
  method: 'post',
  route: '/workertype/:name',
  name: 'updateWorkerType',
  title: 'Update WorkerType',
  stability: APIBuilder.stability.experimental,
  input: 'create-workertype-request.yml',
  output: 'workertype-full.yml',
  scopes: {AllOf: [
    'worker-manager:update-worker-type:<name>',
    'worker-manager:provider:<provider>',
  ]},
  description: [
    'Given an existing workertype definition, this will modify it and return the new definition.',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;
  const input = req.body;
  const providerName = input.provider;

  await req.authorize({name, provider: providerName});

  const provider = this.providers[providerName];
  if (!provider) {
    return res.reportError('InputError', 'Invalid Provider', {
      provider: providerName,
      validProviders: Object.keys(this.providers),
    });
  }

  const error = provider.validate(input.config);
  if (error) {
    return res.reportError('InputValidationError', error);
  }

  const workerType = await this.WorkerType.load({
    name,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }

  await workerType.modify(wt => {
    wt.config = input.config;
    wt.description = input.description;
    wt.provider = providerName;
    wt.owner = input.owner;
    wt.lastModified = new Date();
  });

  res.reply(workerType.serializable());
});

builder.declare({
  method: 'get',
  route: '/workertype/:name',
  name: 'workerType',
  title: 'Get WorkerType',
  stability: APIBuilder.stability.experimental,
  output: 'workertype-full.yml',
  description: [
    'Given an existing workertype defition, this will fetch it.',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;

  const workerType = await this.WorkerType.load({
    name,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }
  res.reply(workerType.serializable());
});

builder.declare({
  method: 'delete',
  route: '/workertype/:name',
  name: 'deleteWorkerType',
  title: 'Delete WorkerType',
  scopes: 'worker-manager:delete-worker-type:<name>',
  stability: APIBuilder.stability.experimental,
  description: [
    'Delete an existing workertype definition.',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;

  const workerType = await this.WorkerType.load({
    name,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }

  await workerType.modify(wt => {
    wt.scheduledForDeletion = true;
  });

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

  if (data.continuation) {
    data.continuationToken = data.continuation;
  }
  return res.reply(data);
});

/*
 * ************** BELOW HERE LIVE PROVIDER ENDPOINTS **************
 */

builder.declare({
  method: 'post',
  route: '/credentials/google/:name',
  name: 'credentialsGoogle',
  title: 'Google Credentials',
  stability: APIBuilder.stability.experimental,
  input: 'credentials-google-request.yml',
  output: 'temp-creds-response.yml',
  description: [
    'Get Taskcluster credentials for a worker given an Instance Identity Token',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;

  try {
    const workerType = await this.WorkerType.load({name});
    return res.reply(await this.providers[workerType.provider].verifyIdToken({
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
