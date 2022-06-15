const { APIBuilder, paginateResults } = require('taskcluster-lib-api');
const slug = require('slugid');
const assert = require('assert');
const { ApiError, Provider } = require('./providers/provider');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { WorkerPool, WorkerPoolError, Worker } = require('./data');
const { createCredentials, joinWorkerPoolId } = require('./util');
const { TaskQueue } = require('./queue-data');

let builder = new APIBuilder({
  title: 'Worker Manager Service',
  description: [
    'This service manages workers, including provisioning for dynamic worker pools.',
    '',
    'Methods interacting with a provider may return a 503 response if that provider has',
    'not been able to start up, such as if the service to which it interfaces has an',
    'outage.  Such requests can be retried as for any other 5xx response.',
  ].join('\n'),
  serviceName: 'worker-manager',
  apiVersion: 'v1',
  params: {
    workerPoolId: /^[a-zA-Z0-9-_]{1,38}\/[a-z]([-a-z0-9]{0,36}[a-z0-9])?$/,
    workerGroup: /^([a-zA-Z0-9-_]{1,38})$/,
    workerId: /^([a-zA-Z0-9-_]{1,38})$/,
  },
  errorCodes: {
    ProviderSetupFailed: 503,
  },
  context: [
    'cfg',
    'db',
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
  scopes: 'worker-manager:list-providers',
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

  const providers = Object.entries(this.cfg.providers).map(([providerId, { providerType }]) => ({
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
  scopes: { AllOf: [
    'worker-manager:manage-worker-pool:<workerPoolId>',
    'worker-manager:provider:<providerId>',
  ] },
  description: [
    'Create a new worker pool. If the worker pool already exists, this will throw an error.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId } = req.params;
  const input = req.body;
  const providerId = input.providerId;

  await req.authorize({ workerPoolId, providerId });

  const provider = this.providers.get(providerId);
  if (!provider) {
    return res.reportError('InputError', 'Invalid Provider', {
      providerId,
      validProviderIds: this.providers.validProviderIds(),
    });
  } else if (provider.setupFailed) {
    return res.reportError('ProviderSetupFailed', 'Provider backend may be down or misconfigured', {
      providerId,
    });
  }

  // This has been validated at the api level to ensure that it
  // is valid config for at least one of our providers but
  // we check here to see that the config matches the config for the configured provider
  const error = provider.validate(input.config);
  if (error) {
    return res.reportError('InputValidationError', error);
  }

  let workerPool = WorkerPool.fromApi({ workerPoolId, ...input });

  try {
    await workerPool.create(this.db);
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    return res.reportError('RequestConflict', 'Worker pool already exists', {});
  }

  await this.publisher.workerPoolCreated({ workerPoolId, providerId });
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'post',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'updateWorkerPool',
  title: 'Update Worker Pool',
  stability: APIBuilder.stability.experimental,
  category: 'Worker Pools',
  input: 'update-worker-pool-request.yml',
  output: 'worker-pool-full.yml',
  scopes: { AllOf: [
    'worker-manager:manage-worker-pool:<workerPoolId>',
    'worker-manager:provider:<providerId>',
  ] },
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
  const { workerPoolId } = req.params;
  const input = req.body;
  const providerId = input.providerId;

  await req.authorize({ workerPoolId, providerId });

  const provider = this.providers.get(providerId);
  if (!provider) {
    return res.reportError('InputError', 'Invalid Provider', {
      providerId,
      validProviderIds: this.providers.validProviderIds(),
    });
  } else if (provider.setupFailed) {
    return res.reportError('ProviderSetupFailed', 'Provider backend may be down or misconfigured', {
      providerId,
    });
  }

  const error = provider.validate(input.config);
  if (error) {
    return res.reportError('InputValidationError', error);
  }

  if (input.workerPoolId && input.workerPoolId !== workerPoolId) {
    return res.reportError('InputError', 'Incorrect workerPoolId in request body', {});
  }

  const [row] = await this.db.fns.update_worker_pool_with_capacity_and_counts_by_state(
    workerPoolId,
    input.providerId,
    input.description,
    input.config,
    new Date(),
    input.owner,
    input.emailOnError);
  if (!row) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  const workerPool = WorkerPool.fromDb(row);

  await this.publisher.workerPoolUpdated({
    workerPoolId,
    providerId,
    previousProviderId: row.previous_provider_id,
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
  const { workerPoolId } = req.params;
  const providerId = "null-provider";

  await req.authorize({ workerPoolId });

  let workerPool = await WorkerPool.get(this.db, workerPoolId);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  const [row] = await this.db.fns.update_worker_pool_with_capacity_and_counts_by_state(
    workerPoolId,
    providerId,
    workerPool.description,
    workerPool.config,
    new Date(),
    workerPool.owner,
    workerPool.emailOnError);
  if (!row) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }
  workerPool = WorkerPool.fromDb(row);

  await this.publisher.workerPoolUpdated({
    workerPoolId,
    providerId,
    previousProviderId: row.previous_provider_id,
  });
  res.reply(workerPool.serializable());
});

builder.declare({
  method: 'get',
  route: '/worker-pool/:workerPoolId(*)',
  name: 'workerPool',
  scopes: 'worker-manager:get-worker-pool:<workerPoolId>',
  title: 'Get Worker Pool',
  category: 'Worker Pools',
  stability: APIBuilder.stability.stable,
  output: 'worker-pool-full.yml',
  description: [
    'Fetch an existing worker pool defition.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId } = req.params;

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
  scopes: 'worker-manager:list-worker-pools',
  title: 'List All Worker Pools',
  stability: APIBuilder.stability.stable,
  category: 'Worker Pools',
  output: 'worker-pool-list.yml',
  description: [
    'Get the list of all the existing worker pools.',
  ].join('\n'),
}, async function(req, res) {
  const { continuationToken, rows } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_worker_pools_with_capacity_and_counts_by_state(size, offset),
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
  scopes: { AllOf: [
    'assume:worker-pool:<workerPoolId>',
    'assume:worker-id:<workerGroup>/<workerId>',
  ] },
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
  const { workerPoolId } = req.params;
  const input = req.body;
  const { workerGroup, workerId } = input;

  await req.authorize({ workerPoolId, workerGroup, workerId });

  const workerPool = await WorkerPool.get(this.db, workerPoolId);
  if (!workerPool) {
    return res.reportError('ResourceNotFound', 'Worker pool does not exist', {});
  }

  // Use the current provider to report the error, even if it didn't create the
  // worker.  If this distinction becomes important, this can be changed to get
  // the worker and use its providerId instead of workerPool.providerId.
  const provider = await this.providers.get(workerPool.providerId);
  if (!provider) {
    return res.reportError('InputError', 'Invalid Provider', {
      providerId: workerPool.providerId,
    });
  } else if (provider.setupFailed) {
    return res.reportError('ProviderSetupFailed', 'Provider backend may be down or misconfigured', {
      providerId: workerPool.providerId,
    });
  }

  const wpe = await provider.reportError({
    workerPool,
    kind: input.kind,
    title: input.title,
    description: input.description,
    extra: { ...input.extra, workerGroup, workerId },
  });

  res.reply(wpe.serializable());
});

builder.declare({
  method: 'get',
  route: '/worker-pool-errors/:workerPoolId(*)',
  query: paginateResults.query,
  name: 'listWorkerPoolErrors',
  scopes: 'worker-manager:list-worker-pool-errors:<workerPoolId>',
  title: 'List Worker Pool Errors',
  category: 'Worker Pools',
  stability: APIBuilder.stability.stable,
  output: 'worker-pool-error-list.yml',
  description: [
    'Get the list of worker pool errors.',
  ].join('\n'),
}, async function(req, res) {
  const { errorId, workerPoolId } = req.params;
  const { continuationToken, rows } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_worker_pool_errors_for_worker_pool(
      errorId || null,
      workerPoolId || null,
      size,
      offset,
    ),
  });

  return res.reply({
    workerPoolErrors: rows.map(e => WorkerPoolError.fromDb(e).serializable()),
    continuationToken,
  });
});

builder.declare({
  method: 'get',
  route: '/workers/:workerPoolId:/:workerGroup',
  query: paginateResults.query,
  name: 'listWorkersForWorkerGroup',
  scopes: 'worker-manager:list-workers:<workerPoolId>/<workerGroup>',
  title: 'Workers in a specific Worker Group in a Worker Pool',
  stability: APIBuilder.stability.stable,
  output: 'worker-list.yml',
  category: 'Workers',
  description: [
    'Get the list of all the existing workers in a given group in a given worker pool.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId, workerGroup } = req.params;

  const { rows, continuationToken } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_workers_without_provider_data(
      workerPoolId,
      workerGroup,
      null,
      null,
      size,
      offset),
  });

  return res.reply({
    workers: rows.map(w => Worker.fromDb(w).serializable({ removeQueueData: true })),
    continuationToken,
  });
});

builder.declare({
  method: 'get',
  route: '/workers/:workerPoolId:/:workerGroup/:workerId',
  name: 'worker',
  scopes: 'worker-manager:get-worker:<workerPoolId>/<workerGroup>/<workerId>',
  title: 'Get a Worker',
  stability: APIBuilder.stability.stable,
  output: 'worker-full.yml',
  category: 'Workers',
  description: [
    'Get a single worker.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId, workerGroup, workerId } = req.params;
  const worker = await Worker.get(this.db, { workerPoolId, workerGroup, workerId });

  if (!worker) {
    return res.reportError('ResourceNotFound', 'Worker not found', {});
  }
  res.reply(worker.serializable({ removeQueueData: true }));
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
    'Create a new worker.  This is only useful for worker pools where the provider',
    'does not create workers automatically, such as those with a `static` provider',
    'type.  Providers that do not support creating workers will return a 400 error.',
    'See the documentation for the individual providers, and in particular the',
    '[static provider](https://docs.taskcluster.net/docs/reference/core/worker-manager/)',
    'for more information.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId, workerGroup, workerId } = req.params;
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
  } else if (provider.setupFailed) {
    return res.reportError('ProviderSetupFailed', 'Provider backend may be down or misconfigured', {
      providerId: workerPool.providerId,
    });
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

  return res.reply(worker.serializable({ removeQueueData: true }));
});

builder.declare({
  method: 'post',
  route: '/workers/:workerPoolId:/:workerGroup/:workerId',
  name: 'updateWorker',
  title: 'Update an existing Worker',
  category: 'Workers',
  stability: APIBuilder.stability.stable,
  input: 'create-worker-request.yml',
  output: 'worker-full.yml',
  // note that this pattern relies on workerGroup and workerId not containing `/`
  scopes: 'worker-manager:update-worker:<workerPoolId>/<workerGroup>/<workerId>',
  cleanPayload: cleanCreatePayload,
  description: [
    'Update an existing worker in-place.  Like `createWorker`, this is only useful for',
    'worker pools where the provider does not create workers automatically.',
    'This method allows updating all fields in the schema unless otherwise indicated',
    'in the provider documentation.',
    'See the documentation for the individual providers, and in particular the',
    '[static provider](https://docs.taskcluster.net/docs/reference/core/worker-manager/)',
    'for more information.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId, workerGroup, workerId } = req.params;
  const workerPool = await WorkerPool.get(this.db, workerPoolId);
  if (!workerPool) {
    return res.reportError('ResourceNotFound',
      `Worker pool ${workerPoolId} does not exist`, {});
  }

  // NOTE: unlike in createWorker, we allow expires to be in the past,
  // as a way of "immediately expiring" a worker.

  const provider = this.providers.get(workerPool.providerId);
  if (!provider) {
    return res.reportError('ResourceNotFound',
      `Provider ${workerPool.providerId} for worker pool ${workerPoolId} does not exist`, {});
  } else if (provider.setupFailed) {
    return res.reportError('ProviderSetupFailed', 'Provider backend may be down or misconfigured', {
      providerId: workerPool.providerId,
    });
  }

  let worker = await Worker.get(this.db, { workerPoolId, workerGroup, workerId });
  if (!worker) {
    return res.reportError('ResourceNotFound',
      `Worker ${workerPoolId}/${workerGroup}/${workerId} does not exist`, {});
  }

  try {
    worker = await provider.updateWorker({
      workerPool,
      worker,
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
  assert(worker, 'Provider updateWorker did not return a worker');

  return res.reply(worker.serializable({ removeQueueData: true }));
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
  const { workerPoolId, workerGroup, workerId } = req.params;
  const worker = await Worker.get(this.db, { workerPoolId, workerGroup, workerId });

  if (!worker) {
    return res.reportError('ResourceNotFound', 'Worker not found', {});
  }

  const provider = this.providers.get(worker.providerId);
  if (!provider) {
    return res.reportError('ResourceNotFound',
      `Provider ${worker.providerId} for this worker does not exist`, {});
  } else if (provider.setupFailed) {
    return res.reportError('ProviderSetupFailed', 'Provider backend may be down or misconfigured', {
      providerId: worker.providerId,
    });
  }

  try {
    await provider.removeWorker({ worker, reason: 'workerManager.removeWorker API call' });
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
  query: paginateResults.query,
  name: 'listWorkersForWorkerPool',
  scopes: 'worker-manager:list-workers:<workerPoolId>',
  title: 'Workers in a Worker Pool',
  category: 'Workers',
  stability: APIBuilder.stability.stable,
  output: 'worker-list.yml',
  description: [
    'Get the list of all the existing workers in a given worker pool.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId } = req.params;
  const workerPool = await WorkerPool.get(this.db, workerPoolId);

  if(!workerPool){
    return res.reportError('ResourceNotFound',
      `Worker Pool does not exist`, {});
  }

  const { rows, continuationToken } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.get_workers_without_provider_data({
      worker_pool_id_in: workerPoolId,
      worker_group_in: null,
      worker_id_in: null,
      state_in: null,
      page_size_in: size,
      page_offset_in: offset,
    }),
  });

  return res.reply({
    workers: rows.map(w => Worker.fromDb(w).serializable({ removeQueueData: true })),
    continuationToken,
  });
});

let cleanPayload = payload => {
  payload = '(OMITTED)';
  return payload;
};

builder.declare({
  method: 'post',
  route: '/worker/register',
  name: 'registerWorker',
  // NOTE - no scopes required, since workers don't have credentials at this point!
  scopes: null,
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
  const { workerPoolId, providerId, workerGroup, workerId, workerIdentityProof } = req.body;

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
  } else if (provider.setupFailed) {
    return res.reportError('ProviderSetupFailed', 'Provider backend may be down or misconfigured', {
      providerId,
    });
  }

  if (workerPool.providerId !== providerId && !workerPool.previousProviderIds.includes(providerId)) {
    return res.reportError('InputError',
      `Worker pool ${workerPoolId} not associated with provider ${providerId}`, {});
  }

  const worker = await Worker.get(this.db, { workerPoolId, workerGroup, workerId });
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
  const secret = `${slug.nice()}${slug.nice()}`;
  try {
    const encryptedSecret = this.db.encrypt({ value: Buffer.from(secret, 'utf8') });
    const reg = await provider.registerWorker({ worker, workerPool, workerIdentityProof, encryptedSecret });
    await worker.update(this.db, worker => {
      worker.secret = encryptedSecret;
    });
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
  const credentials = createCredentials(worker, expires, this.cfg);

  return res.reply({
    expires: expires.toJSON(),
    credentials,
    workerConfig,
    secret,
  });
});

builder.declare({
  method: 'post',
  route: '/worker/reregister',
  name: 'reregisterWorker',
  title: 'Reregister a Worker',
  category: 'Workers',
  cleanPayload,
  stability: APIBuilder.stability.experimental,
  input: 'reregister-worker-request.yml',
  output: 'reregister-worker-response.yml',
  // note that this pattern relies on workerGroup and workerId not containing `/`
  scopes: 'worker-manager:reregister-worker:<workerPoolId>/<workerGroup>/<workerId>',
  description: [
    'Reregister a running worker.',
    '',
    'This will generate and return new Taskcluster credentials for the worker',
    'on that instance to use. The credentials will not live longer the',
    '`registrationTimeout` for that worker. The endpoint will update `terminateAfter`',
    'for the worker so that worker-manager does not terminate the instance.',
  ].join('\n'),
}, async function(req, res) {
  const { workerPoolId, workerGroup, workerId, secret } = req.body;

  await req.authorize({ workerPoolId, workerGroup, workerId });

  if (secret.length !== 44) {
    throw new Error('secret must be 44 characters');
  }

  const worker = await Worker.get(this.db, { workerPoolId, workerGroup, workerId });

  if (!worker) {
    return res.reportError('InputError', 'Could not generate credentials for this secret', {});
  }

  // worker has not been registered yet
  if (!worker.secret) {
    return res.reportError('InputError', 'Could not generate credentials for this secret', {});
  }

  if (this.db.decrypt({ value: worker.secret }).toString('utf8') !== secret) {
    return res.reportError('InputError', 'Could not generate credentials for this secret', {});
  }

  // defaults to 96 hours if reregistrationTimeout is not defined
  // make sure to turn milliseconds into seconds here since we store it in millieconds
  // after the first interpretation.
  const { terminateAfter } = Provider.interpretLifecycle({ lifecycle: {
    reregistrationTimeout: worker.providerData && (worker.providerData.reregistrationTimeout / 1000),
  } });
  const expires = new Date(terminateAfter);

  // We use these fields from inside the worker rather than
  // what was passed in because that is the thing we have verified
  // to be passing in the token. This helps avoid slipups later
  // like if we had a scope based on workerGroup alone which we do
  // not verify here
  const credentials = createCredentials(worker, expires, this.cfg);
  const newSecret = `${slug.nice()}${slug.nice()}`;

  await worker.update(this.db, worker => {
    worker.secret = this.db.encrypt({ value: Buffer.from(newSecret, 'utf8') });
    // All dynamic providers set this value for every worker
    if (worker.providerData.terminateAfter) {
      worker.providerData.terminateAfter = terminateAfter;
    }
  });

  return res.reply({ expires: expires.toJSON(), credentials, secret: newSecret });
});

builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers',
  query: {
    ...paginateResults.query,
    quarantined: /^(true|false)$/,
    workerState: /^(requested|running|stopping|stopped)$/,
  },
  name: 'listWorkers',
  scopes: 'worker-manager:list-workers:<provisionerId>/<workerType>',
  stability: APIBuilder.stability.experimental,
  category: 'Worker Metadata',
  output: 'list-workers-response.yml',
  title: 'Get a list of all active workers of a workerType',
  description: [
    'Get a list of all active workers of a workerType.',
    '',
    '`listWorkers` allows a response to be filtered by quarantined and non quarantined workers,',
    'as well as the current state of the worker.',
    'To filter the query, you should call the end-point with one of [`quarantined`, `workerState`]',
    'as a query-string option with a true or false value.',
    '',
    'The response is paged. If this end-point returns a `continuationToken`, you',
    'should call the end-point again with the `continuationToken` as a query-string',
    'option. By default this end-point will list up to 1000 workers in a single',
    'page. You may limit this with the query-string parameter `limit`.',
  ].join('\n'),
}, async function(req, res) {
  const quarantined = req.query.quarantined || null;
  const workerState = req.query.workerState || null;
  const { provisionerId, workerType } = req.params;
  const now = new Date();
  const workerPoolId = joinWorkerPoolId(provisionerId, workerType);

  const { rows: workers, continuationToken } = await Worker.getWorkers(
    this.db,
    { workerPoolId },
    { query: req.query },
  );

  const result = {
    workers: workers.filter(worker => {
      let quarantineFilter = true;
      if (quarantined === 'true') {
        quarantineFilter = worker.quarantineUntil >= now;
      } else if (quarantined === 'false') {
        quarantineFilter = worker.quarantineUntil < now;
      }
      // filter out anything that is both expired and not quarantined
      // so that quarantined workers remain visible even after expiration
      return (
        (worker.expires >= now || worker.quarantineUntil >= now) &&
        quarantineFilter &&
        (workerState ? worker.state === workerState : true)
      );
    }).map(worker => {
      let entry = {
        workerGroup: worker.workerGroup,
        workerId: worker.workerId,
        firstClaim: worker.firstClaim?.toJSON(),
        lastDateActive: worker.lastDateActive?.toJSON(),
        workerPoolId: worker.workerPoolId,
        state: worker.state || 'standalone',
        capacity: worker.capacity || 0,
        providerId: worker.providerId || 'none',
        quarantineUntil: worker.quarantineUntil?.toJSON(),
      };
      if (worker.recentTasks.length > 0) {
        entry.latestTask = worker.recentTasks[worker.recentTasks.length - 1];
      }
      return entry;
    }),
  };

  if (continuationToken) {
    result.continuationToken = continuationToken;
  }

  return res.reply(result);
});

builder.declare({
  method: 'get',
  route: '/provisioners/:provisionerId/worker-types/:workerType/workers/:workerGroup/:workerId',
  name: 'getWorker',
  scopes: 'worker-manager:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>',
  stability: APIBuilder.stability.experimental,
  output: 'worker-response.yml',
  title: 'Get a worker-type',
  category: 'Worker Metadata',
  description: [
    'Get a worker from a worker-type.',
  ].join('\n'),
}, async function(req, res) {
  const { provisionerId, workerType, workerGroup, workerId } = req.params;
  const workerPoolId = joinWorkerPoolId(provisionerId, workerType);

  const now = new Date();
  const [worker, tQueue] = await Promise.all([
    Worker.getQueueWorker(this.db, workerPoolId, workerGroup, workerId, now),
    TaskQueue.get(this.db, workerPoolId, now),
  ]);

  // do not consider workers expired until their quarantine date expires.
  const expired = worker && worker.expires < now && worker.quarantineUntil < now;

  if (expired || !worker || !tQueue) {
    return res.reportError('ResourceNotFound',
      'Worker with workerId `{{workerId}}`, workerGroup `{{workerGroup}}`,' +
      'worker-type `{{workerType}}` and provisioner `{{provisionerId}}` not found. ' +
      'Are you sure it was created?', {
        workerId,
        workerGroup,
        workerType,
        provisionerId,
      },
    );
  }

  let workerResult = worker.serializable({ removeWorkerManagerData: true });
  workerResult = { ...workerResult, provisionerId, workerType };

  const actions = [];
  return res.reply(Object.assign({}, workerResult, { actions }));
});

builder.declare({
  method: 'get',
  route: '/__heartbeat__',
  name: 'heartbeat',
  scopes: null,
  category: 'Monitoring',
  stability: 'stable',
  title: 'Heartbeat',
  description: [
    'Respond with a service heartbeat.',
    '',
    'This endpoint is used to check on backing services this service',
    'depends on.',
  ].join('\n'),
}, function(_req, res) {
  // TODO: add implementation
  res.reply({});
});
