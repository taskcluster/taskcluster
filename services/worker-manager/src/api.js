const taskcluster = require('taskcluster-client');
const APIBuilder = require('taskcluster-lib-api');
const assert = require('assert');
const {ApiError} = require('./providers/provider');

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
    'cfg',
    'Worker',
    'WorkerPool',
    'WorkerPoolError',
    'providers',
    'publisher',
  ],
});

module.exports = builder;

builder.declare({
  method: 'get',
  route: '/providers',
  name: 'listProviders',
  input: undefined,
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  output: 'provider-list.yml',
  stability: 'stable',
  category: 'Worker Manager',
  title: 'List Providers',
  description: [
    'Retrieve a list of providers that are available for worker pools.',
  ].join('\n'),
}, function(req, res) {
  return res.reply({
    providers: Object.entries(this.cfg.providers).map(([providerId, {providerType}]) => ({
      providerId,
      providerType,
    })).slice(0, req.query.limit || 100),
  });
});

builder.declare({
  method: 'put',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'createWorkerPool',
  title: 'Create Worker Pool',
  category: 'Worker Manager',
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
  category: 'Worker Manager',
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
  category: 'Worker Manager',
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
  category: 'Worker Manager',
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
  route: '/worker-pool-errors/:workerPoolId(*)',
  name: 'reportWorkerError',
  title: 'Report an error from a worker',
  input: 'report-worker-error-request.yml',
  category: 'Worker Manager',
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
  category: 'Worker Manager',
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
  route: '/workers/:workerPoolId:/:workerGroup',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name: 'listWorkersForWorkerGroup',
  title: 'Workers in a specific Worker Group in a Worker Pool',
  stability: APIBuilder.stability.experimental,
  output: 'worker-list.yml',
  category: 'Worker Manager',
  description: [
    'Get the list of all the existing workers in a given group in a given worker pool.',
  ].join('\n'),
}, async function(req, res) {
  const scanOptions = {
    continuation: req.query.continuationToken,
    limit: parseInt(req.query.limit || 100, 10),
    matchPartition: 'exact',
  };

  const data = await this.Worker.scan({
    workerPoolId: req.params.workerPoolId,
    workerGroup: req.params.workerGroup,
  }, scanOptions);

  const result = {
    workers: data.entries.map(e => e.serializable()),
  };

  if (data.continuation) {
    result.continuationToken = data.continuation;
  }
  return res.reply(result);
});

builder.declare({
  method: 'get',
  route: '/workers/:workerPoolId:/:workerGroup/:workerId',
  name: 'worker',
  title: 'Get a Worker',
  stability: APIBuilder.stability.experimental,
  output: 'worker-full.yml',
  category: 'Worker Manager',
  description: [
    'Get a single worker.',
  ].join('\n'),
}, async function(req, res) {
  const data = await this.Worker.load({
    workerPoolId: req.params.workerPoolId,
    workerGroup: req.params.workerGroup,
    workerId: req.params.workerId,
  }, true);

  if (!data) {
    return res.reportError('ResourceNotFound', 'Worker not found', {});
  }

  return res.reply(data.serializable());
});

builder.declare({
  method: 'put',
  route: '/workers/:workerPoolId:/:workerGroup/:workerId',
  name: 'createWorker',
  title: 'Create a Worker',
  category: 'Worker Manager',
  stability: APIBuilder.stability.experimental,
  input: 'create-worker-request.yml',
  output: 'worker-full.yml',
  // note that this pattern relies on workerGroup and workerId not containing `/`
  scopes: 'worker-manager:create-worker:<workerPoolId>/<workerGroup>/<workerId>',
  description: [
    'Create a new worker.  The precise behavior of this method depends',
    'on the provider implementing the given worker pool.  Some providers',
    'do not support creating workers at all, and will return a 400 error.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId, workerGroup, workerId} = req.params;
  const workerPool = await this.WorkerPool.load({workerPoolId}, true);
  if (!workerPool) {
    return res.reportError('ResourceNotFound',
      `Worker pool ${workerPoolId} does not exist`, {});
  }

  if (new Date(req.body.expires) < new Date()) {
    return res.reportError('InputError', 'worker.expires must be in the future', {});
  }

  const provider = this.providers.get(workerPool.providerId);
  if (!provider) {
    return res.reportError('ResourceNotFound',
      `Provider ${workerPool.providerId} for worker pool ${workerPoolId} does not exist`, {});
  }

  let worker;

  try {
    worker = await provider.createWorker({
      workerPool,
      workerGroup,
      workerId,
      input: req.body,
    });
  } catch (err) {
    if (!(err instanceof ApiError)) {
      throw err;
    }
    return res.reportError('InputError', err.message, {});
  }
  assert(worker, 'Provider createWorker did not return a worker');

  return res.reply(worker.serializable());
});

builder.declare({
  method: 'delete',
  route: '/workers/:workerPoolId:/:workerGroup/:workerId',
  name: 'removeWorker',
  title: 'Remove a Worker',
  category: 'Worker Manager',
  stability: APIBuilder.stability.experimental,
  // note that this pattern relies on workerGroup and workerId not containing `/`
  scopes: 'worker-manager:remove-worker:<workerPoolId>/<workerGroup>/<workerId>',
  description: [
    'Remove an existing worker.  The precise behavior of this method depends',
    'on the provider implementing the given worker.  Some providers',
    'do not support removing workers at all, and will return a 400 error.',
    'Others may begin removing the worker, but it may remain available via',
    'the API (perhaps even in state RUNNING) afterward.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId, workerGroup, workerId} = req.params;
  const worker = await this.Worker.load({workerPoolId, workerGroup, workerId}, true);

  if (!worker) {
    return res.reportError('ResourceNotFound', 'Worker not found', {});
  }

  const provider = this.providers.get(worker.providerId);
  if (!provider) {
    return res.reportError('ResourceNotFound',
      `Provider ${worker.providerId} for this worker does not exist`, {});
  }

  try {
    await provider.removeWorker(worker);
  } catch (err) {
    if (!(err instanceof ApiError)) {
      throw err;
    }
    return res.reportError('InputError', err.message, {});
  }

  return res.reply({});
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
  category: 'Worker Manager',
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

builder.declare({
  method: 'post',
  route: '/worker/register',
  name: 'registerWorker',
  title: 'Register a running worker',
  stability: APIBuilder.stability.experimental,
  category: 'Worker Manager',
  input: 'register-worker-request.yml',
  output: 'register-worker-response.yml',
  description: [
    'Register a running worker.  Workers call this method on worker start-up.',
    '',
    'This call both marks the worker as running and returns the credentials',
    'the worker will require to perform its work.  The worker must provide',
    'some proof of its identity, and that proof varies by provider type.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId, providerId, workerGroup, workerId, workerIdentityProof} = req.body;

  // carefully check each value provided, since we have not yet validated the
  // worker's "proof"

  const workerPool = await this.WorkerPool.load({workerPoolId}, true);
  if (!workerPool) {
    return res.reportError('ResourceNotFound',
      `Worker pool ${workerPoolId} does not exist`, {});
  }

  const provider = this.providers.get(providerId);
  if (!provider) {
    return res.reportError('ResourceNotFound',
      `Provider ${providerId} does not exist`, {});
  }

  if (workerPool.providerId !== providerId && !workerPool.previousProviderIds.includes(providerId)) {
    return res.reportError('InputError',
      `Worker pool ${workerPoolId} not associated with provider ${providerId}`, {});
  }

  const worker = await this.Worker.load({workerPoolId, workerGroup, workerId}, true);
  if (!worker) {
    return res.reportError('ResourceNotFound',
      `Worker ${workerGroup}/${workerId} in worker pool ${workerPoolId} does not exist`, {});
  }

  if (worker.providerId !== providerId) {
    return res.reportError('InputError',
      `Worker ${workerGroup}/${workerId} does not have provider ${providerId}`, {});
  }

  let expires;
  try {
    const reg = await provider.registerWorker({worker, workerPool, workerIdentityProof});
    expires = reg.expires;
  } catch (err) {
    if (!(err instanceof ApiError)) {
      throw err;
    }
    return res.reportError('InputError', err.message, {});
  }
  assert(expires, 'registerWorker did not return expires');

  const credentials = taskcluster.createTemporaryCredentials({
    clientId: `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`,
    scopes: [
      `assume:worker-type:${workerPoolId}`, // deprecated role
      `assume:worker-pool:${workerPoolId}`,
      `assume:worker-id:${workerGroup}/${workerId}`,
      `queue:worker-id:${workerGroup}/${workerId}`,
      `secrets:get:worker-type:${workerPoolId}`, // deprecated secret name
      `secrets:get:worker-pool:${workerPoolId}`,
      `queue:claim-work:${workerPoolId}`,
    ],
    start: taskcluster.fromNow('-15 minutes'),
    expiry: expires,
    credentials: this.cfg.taskcluster.credentials,
  });

  return res.reply({expires: expires.toJSON(), credentials});
});
