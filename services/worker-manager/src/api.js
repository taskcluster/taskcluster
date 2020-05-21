const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const {APIBuilder, paginateResults} = require('taskcluster-lib-api');
const assert = require('assert');
const {ApiError} = require('./providers/provider');
const {UNIQUE_VIOLATION} = require('taskcluster-lib-postgres');
const {WorkerPool} = require('./data');

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
    'db',
    'Worker',
    'WorkerPoolError',
    'providers',
    'publisher',
    'monitor',
    'notify',
  ],
});

module.exports = builder;

builder.declare({
  method: 'get',
  route: '/providers',
  name: 'listProviders',
  input: undefined,
  query: {
    continuationToken: /^[0-9]+$/,
    limit: /^[0-9]+$/,
  },
  output: 'provider-list.yml',
  stability: 'stable',
  category: 'Providers',
  title: 'List Providers',
  description: [
    'Retrieve a list of providers that are available for worker pools.',
  ].join('\n'),
}, function(req, res) {
  const start = req.query.continuationToken ? parseInt(req.query.continuationToken) : 0;
  const limit = req.query.limit ? parseInt(req.query.limit) : 100;

  const providers = Object.entries(this.cfg.providers).map(([providerId, {providerType}]) => ({
    providerId,
    providerType,
  }));

  const end = start + limit < providers.length ? start + limit : undefined;

  return res.reply({
    providers: providers.slice(start, end),
    continuationToken: end ? end.toString() : undefined,
  });
});

builder.declare({
  method: 'put',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'createWorkerPool',
  title: 'Create Worker Pool',
  category: 'Worker Pools',
  stability: APIBuilder.stability.stable,
  input: 'create-worker-pool-request.yml',
  output: 'worker-pool-full.yml',
  scopes: {AllOf: [
    'worker-manager:manage-worker-pool:<workerPoolId>',
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

  let workerPool = WorkerPool.fromApi({workerPoolId, ...input});

  try {
    await workerPool.create(this.db);
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    return res.reportError('RequestConflict', 'Worker pool already exists', {});
  }

  await this.publisher.workerPoolCreated({workerPoolId, providerId});
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'post',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'updateWorkerPool',
  title: 'Update Worker Pool',
  stability: APIBuilder.stability.stable,
  category: 'Worker Pools',
  input: 'update-worker-pool-request.yml',
  output: 'worker-pool-full.yml',
  scopes: {AllOf: [
    'worker-manager:manage-worker-pool:<workerPoolId>',
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

  const updateResult = await this.db.fns.update_worker_pool(
    workerPoolId,
    input.providerId,
    input.description,
    input.config,
    new Date(),
    input.owner,
    input.emailOnError);
  const workerPool = WorkerPool.fromDbRows(updateResult);

  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  await this.publisher.workerPoolUpdated({
    workerPoolId,
    providerId,
    previousProviderId: updateResult.previous_provider_id,
  });
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'delete',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'deleteWorkerPool',
  title: 'Delete Worker Pool',
  stability: APIBuilder.stability.stable,
  category: 'Worker Pools',
  output: 'worker-pool-full.yml',
  scopes: 'worker-manager:manage-worker-pool:<workerPoolId>',
  description: [
    'Mark a worker pool for deletion.  This is the same as updating the pool to',
    'set its providerId to `"null-provider"`, but does not require scope',
    '`worker-manager:provider:null-provider`.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId} = req.params;
  const providerId = "null-provider";

  await req.authorize({workerPoolId});

  let workerPool = await WorkerPool.get(this.db, workerPoolId);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  const updateResult = await this.db.fns.update_worker_pool(
    workerPoolId,
    providerId,
    workerPool.description,
    workerPool.config,
    new Date(),
    workerPool.owner,
    workerPool.emailOnError);
  workerPool = WorkerPool.fromDbRows(updateResult);

  await this.publisher.workerPoolUpdated({
    workerPoolId,
    providerId,
    previousProviderId: updateResult.previous_provider_id,
  });
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'get',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'workerPool',
  title: 'Get Worker Pool',
  category: 'Worker Pools',
  stability: APIBuilder.stability.stable,
  output: 'worker-pool-full.yml',
  description: [
    'Fetch an existing worker pool defition.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId} = req.params;

  const workerPool = await WorkerPool.get(this.db, workerPoolId);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'get',
  route: '/worker-pools',
  query: paginateResults.query,
  name: 'listWorkerPools',
  title: 'List All Worker Pools',
  stability: APIBuilder.stability.stable,
  category: 'Worker Pools',
  output: 'worker-pool-list.yml',
  description: [
    'Get the list of all the existing worker pools.',
  ].join('\n'),
}, async function(req, res) {
  const {continuationToken, rows} = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_worker_pools(size, offset),
  });
  const result = {
    workerPools: rows.map(r => WorkerPool.fromDb(r).serializable()),
    continuationToken,
  };
  return res.reply(result);
});

builder.declare({
  method: 'post',
  route: '/worker-pool-errors/:workerPoolId(*)',
  name: 'reportWorkerError',
  title: 'Report an error from a worker',
  input: 'report-worker-error-request.yml',
  category: 'Worker Interface',
  output: 'worker-pool-error.yml',
  scopes: {AllOf: [
    'assume:worker-pool:<workerPoolId>',
    'assume:worker-id:<workerGroup>/<workerId>',
  ]},
  stability: APIBuilder.stability.stable,
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

  const workerPool = await WorkerPool.get(this.db, workerPoolId);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  // Use the current provider to report the error, even if it didn't create the
  // worker.  If this distinction becomes important, this can be changed to get
  // the worker and use its providerId instead of workerPool.providerId.
  const provider = await this.providers.get(workerPool.providerId);

  const wpe = await provider.reportError({
    workerPool,
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
  category: 'Worker Pools',
  stability: APIBuilder.stability.stable,
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
  stability: APIBuilder.stability.stable,
  output: 'worker-list.yml',
  category: 'Workers',
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
  }, scanOptions);

  // We only support conditions on dates, as they cannot
  // be used to inject SQL -- `Date.toJSON` always produces a simple string
  // with no SQL metacharacters.
  //
  // Previously with azure, we added the query in the scan method
  // (i.e., this.Worker.scan({ workerGroup, ... }))
  data.entries = data.entries.filter(entry => {
    if (entry.workerGroup !== req.params.workerGroup) {
      return false;
    }

    return true;
  });

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
  stability: APIBuilder.stability.stable,
  output: 'worker-full.yml',
  category: 'Workers',
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

let cleanCreatePayload = payload => {
  if (payload.providerInfo && payload.providerInfo.staticSecret) {
    payload.providerInfo.staticSecret = '(OMITTED)';
  }
  return payload;
};

builder.declare({
  method: 'put',
  route: '/workers/:workerPoolId:/:workerGroup/:workerId',
  name: 'createWorker',
  title: 'Create a Worker',
  category: 'Workers',
  stability: APIBuilder.stability.stable,
  input: 'create-worker-request.yml',
  output: 'worker-full.yml',
  // note that this pattern relies on workerGroup and workerId not containing `/`
  scopes: 'worker-manager:create-worker:<workerPoolId>/<workerGroup>/<workerId>',
  cleanPayload: cleanCreatePayload,
  description: [
    'Create a new worker.  The precise behavior of this method depends',
    'on the provider implementing the given worker pool.  Some providers',
    'do not support creating workers at all, and will return a 400 error.',
  ].join('\n'),
}, async function(req, res) {
  const {workerPoolId, workerGroup, workerId} = req.params;
  const workerPool = await WorkerPool.get(this.db, workerPoolId);
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
      input: {
        capacity: 1,
        ...req.body,
      },
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
  route: '/workers/:workerPoolId/:workerGroup/:workerId',
  name: 'removeWorker',
  title: 'Remove a Worker',
  category: 'Workers',
  stability: APIBuilder.stability.stable,
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
    await provider.removeWorker({worker, reason: 'workerManager.removeWorker API call'});
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
  category: 'Workers',
  stability: APIBuilder.stability.stable,
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

let cleanPayload = payload => {
  payload = '(OMITTED)';
  return payload;
};

builder.declare({
  method: 'post',
  route: '/worker/register',
  name: 'registerWorker',
  title: 'Register a running worker',
  stability: APIBuilder.stability.stable,
  category: 'Worker Interface',
  input: 'register-worker-request.yml',
  output: 'register-worker-response.yml',
  cleanPayload,
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

  const workerPool = await WorkerPool.get(this.db, workerPoolId);
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

  if (worker.expires < new Date()) {
    return res.reportError('InputError',
      `Worker ${workerGroup}/${workerId} has expired`, {});
  }

  if (worker.providerId !== providerId) {
    return res.reportError('InputError',
      `Worker ${workerGroup}/${workerId} does not have provider ${providerId}`, {});
  }

  let expires, workerConfig;
  try {
    const reg = await provider.registerWorker({worker, workerPool, workerIdentityProof});
    expires = reg.expires;
    workerConfig = reg.workerConfig;
  } catch (err) {
    if (!(err instanceof ApiError)) {
      throw err;
    }
    return res.reportError('InputError', err.message, {});
  }
  assert(expires, 'registerWorker did not return expires');
  assert(expires > new Date(), 'registerWorker returned expires in the past');

  // We use these fields from inside the worker rather than
  // what was passed in because that is the thing we have verified
  // to be passing in the token. This helps avoid slipups later
  // like if we had a scope based on workerGroup alone which we do
  // not verify here
  const credentials = taskcluster.createTemporaryCredentials({
    clientId: `worker/${worker.providerId}/${worker.workerPoolId}/${worker.workerGroup}/${worker.workerId}`,
    scopes: [
      `assume:worker-type:${worker.workerPoolId}`, // deprecated role
      `assume:worker-pool:${worker.workerPoolId}`,
      `assume:worker-id:${worker.workerGroup}/${worker.workerId}`,
      `queue:worker-id:${worker.workerGroup}/${worker.workerId}`,
      `secrets:get:worker-type:${worker.workerPoolId}`, // deprecated secret name
      `secrets:get:worker-pool:${worker.workerPoolId}`,
      `queue:claim-work:${worker.workerPoolId}`,
      `worker-manager:remove-worker:${worker.workerPoolId}/${worker.workerGroup}/${worker.workerId}`,
    ],
    start: taskcluster.fromNow('-15 minutes'),
    expiry: expires,
    credentials: this.cfg.taskcluster.credentials,
  });

  return res.reply({expires: expires.toJSON(), credentials, workerConfig});
});
