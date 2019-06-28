const APIBuilder = require('taskcluster-lib-api');

let builder = new APIBuilder({
  title: 'Taskcluster Worker Manager',
  description: [
    'This service manages workers, including provisioning for dynamic worker pools.',
  ].join('\n'),
  serviceName: 'worker-manager',
  apiVersion: 'v1',
  params: {
    workerPoolId: /^[a-zA-Z0-9-_]{1,38}\/[a-z]([-a-z0-9]{0,36}[a-z0-9])?$/,
  },
  context: [
    'Worker',
    'WorkerPool',
    'WorkerPoolError',
    'providers',
    'publisher',
    'notify',
  ],
});

module.exports = builder;

builder.declare({
  method: 'put',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'createWorkerPool',
  title: 'Create Worker Pool',
  stability: APIBuilder.stability.experimental,
  input: 'create-worker-pool-request.yml',
  output: 'worker-pool-full.yml',
  scopes: {AllOf: [
    'worker-manager:create-worker-type:<workerPoolId>',
    'worker-manager:provider:<providerId>',
  ]},
  description: [
    'Create a new worker pool. If the worker pool already exists, this will throw an error.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId} = req.params;
  const input = req.body;
  const providerId = input.providerId;

  await req.authorize({workerPoolId, providerId});

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
  let workerPool;

  const definition = {
    workerPoolId,
    providerId,
    previousProviderIds: [],
    description: input.description,
    config: input.config,
    created: now,
    lastModified: now,
    owner: input.owner,
    emailOnError: input.emailOnError,
    providerData: {},
  };

  try {
    workerPool = await this.WorkerPool.create(definition);
  } catch (err) {
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }
    workerPool = await this.WorkerPool.load({workerPoolId});

    if (!workerPool.compare(definition)) {
      return res.reportError('RequestConflict', 'Worker pool already exists', {});
    }
  }
  await this.publisher.workerPoolCreated({workerPoolId, providerId});
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'post',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'updateWorkerPool',
  title: 'Update Worker Pool',
  stability: APIBuilder.stability.experimental,
  input: 'update-worker-pool-request.yml',
  output: 'worker-pool-full.yml',
  scopes: {AllOf: [
    'worker-manager:update-worker-type:<workerPoolId>',
    'worker-manager:provider:<providerId>',
  ]},
  description: [
    'Given an existing worker pool definition, this will modify it and return',
    'the new definition.',
    '',
    'To delete a worker pool, set its `providerId` to `"null-provider"`.',
    'After any existing workers have exited, a cleanup job will remove the',
    'worker pool.  During that time, the worker pool can be updated again, such',
    'as to set its `providerId` to a real provider.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId} = req.params;
  const input = req.body;
  const providerId = input.providerId;

  await req.authorize({workerPoolId, providerId});

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

  if (input.workerPoolId && input.workerPoolId !== workerPoolId) {
    return res.reportError('InputError', 'Incorrect workerPoolId in request body', {});
  }

  const workerPool = await this.WorkerPool.load({
    workerPoolId,
  }, true);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  const previousProviderId = workerPool.providerId;

  await workerPool.modify(wt => {
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

  await this.publisher.workerPoolUpdated({workerPoolId, providerId, previousProviderId});
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'get',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'workerPool',
  title: 'Get Worker Pool',
  stability: APIBuilder.stability.experimental,
  output: 'worker-pool-full.yml',
  description: [
    'Fetch an existing worker pool defition.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId} = req.params;

  const workerPool = await this.WorkerPool.load({
    workerPoolId,
  }, true);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'get',
  route: '/worker-pools',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listWorkerPools',
  title: 'List All Worker Pools',
  stability: APIBuilder.stability.experimental,
  output: 'worker-pool-list.yml',
  description: [
    'Get the list of all the existing worker pools.',
  ].join('\n'),
}, async function(req, res) {
  const { continuationToken } = req.query;
  const limit = parseInt(req.query.limit || 100, 10);
  const scanOptions = {
    continuation: continuationToken,
    limit,
  };

  const data = await this.WorkerPool.scan({}, scanOptions);
  const result = {
    workerPools: data.entries.map(e => e.serializable()),
  };

  if (data.continuation) {
    result.continuationToken = data.continuation;
  }
  return res.reply(result);
});

builder.declare({
  method: 'post',
  route: '/worker-pools-errors/:workerPoolId(*)',
  name: 'reportWorkerError',
  title: 'Report an error from a worker',
  input: 'report-worker-error-request.yml',
  output: 'worker-pool-error.yml',
  scopes: {AllOf: [
    'assume:worker-pool:<workerPoolId>',
    'assume:worker-id:<workerGroup>/<workerId>',
  ]},
  stability: APIBuilder.stability.experimental,
  description: [
    'Report an error that occurred on a worker.  This error will be included',
    'with the other errors in `listWorkerPoolErrors(workerPoolId)`.',
    '',
    'Workers can use this endpoint to report startup or configuration errors',
    'that might be associated with the worker pool configuration and thus of',
    'interest to a worker-pool administrator.',
    '',
    'NOTE: errors are publicly visible.  Ensure that none of the content',
    'contains secrets or other sensitive information.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId} = req.params;
  const input = req.body;
  const {workerGroup, workerId} = input;

  await req.authorize({workerPoolId, workerGroup, workerId});

  const workerPool = await this.WorkerPool.load({workerPoolId}, true);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  const wpe = await workerPool.reportError({
    kind: input.kind,
    title: input.title,
    description: input.description,
    extra: {...input.extra, workerGroup, workerId},
    notify: this.notify,
    WorkerPoolError: this.WorkerPoolError,
  });

  res.reply(wpe.serializable());
});

builder.declare({
  method: 'get',
  route: '/worker-pool-errors/:workerPoolId(*)',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listWorkerPoolErrors',
  title: 'List Worker Pool Errors',
  stability: APIBuilder.stability.experimental,
  output: 'worker-pool-error-list.yml',
  description: [
    'Get the list of worker pool errors.',
  ].join('\n'),
}, async function(req, res) {
  const { continuationToken } = req.query;
  const limit = parseInt(req.query.limit || 100, 10);
  const scanOptions = {
    continuation: continuationToken,
    limit,
    matchPartition: 'exact',
  };

  const data = await this.WorkerPoolError.scan({
    workerPoolId: req.params.workerPoolId,
  }, scanOptions);
  const result = {
    workerPoolErrors: data.entries.map(e => e.serializable()),
  };

  if (data.continuation) {
    result.continuationToken = data.continuation;
  }
  return res.reply(result);
});

builder.declare({
  method: 'get',
  route: '/workers/:workerPoolId(*)',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listWorkersForWorkerPool',
  title: 'Workers in a Worker Pool',
  stability: APIBuilder.stability.experimental,
  output: 'worker-list.yml',
  description: [
    'Get the list of all the existing workers in a given worker pool.',
  ].join('\n'),
}, async function(req, res) {
  const scanOptions = {
    continuation: req.query.continuationToken,
    limit: parseInt(req.query.limit || 100, 10),
    matchPartition: 'exact',
  };

  const data = await this.Worker.scan({
    workerPoolId: req.params.workerPoolId,
  }, scanOptions);

  const result = {
    workers: data.entries.map(e => e.serializable()),
  };

  if (data.continuation) {
    result.continuationToken = data.continuation;
  }
  return res.reply(result);
});
