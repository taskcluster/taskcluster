const taskcluster = require('taskcluster-client');
const slug = require('slugid');
const assert = require('assert');
const helper = require('./helper');
const { WorkerPool, Worker } = require('../src/data');
const testing = require('taskcluster-lib-testing');
const fs = require('fs');
const path = require('path');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const workerPoolId = 'pp/ee';
  const providerId = 'testing1';
  const workerGroup = 'wg';
  const workerId = 'wi';
  const defaultWorkerPool = {
    workerPoolId,
    providerId,
    previousProviderIds: [],
    description: 'bar',
    created: taskcluster.fromNow('0 seconds'),
    lastModified: taskcluster.fromNow('0 seconds'),
    config: {},
    owner: 'example@example.com',
    emailOnError: false,
    providerData: {},
  };
  const defaultWorker = {
    workerPoolId,
    workerGroup,
    workerId,
    providerId,
    created: new Date(),
    lastModified: new Date(),
    lastChecked: new Date(),
    expires: taskcluster.fromNow('90 seconds'),
    capacity: 1,
    state: 'requested',
    providerData: {},
  };

  // create a test worker pool directly in the DB
  const createWorkerPool = async overrides => {
    const workerPool = WorkerPool.fromApi(
      { ...defaultWorkerPool, ...overrides });
    await workerPool.create(helper.db);
  };

  // create a test worker pool directly in the DB
  const createWorker = overrides => {
    const worker = Worker.fromApi(
      { ...defaultWorker, ...overrides });
    return worker.create(helper.db);
  };

  test('ping', async function() {
    await helper.workerManager.ping();
  });

  test('list providers', async function() {
    const { providers } = await helper.workerManager.listProviders();
    assert.deepStrictEqual(providers, [
      { providerId: 'testing1', providerType: 'testing' },
      { providerId: 'testing2', providerType: 'testing' },
      { providerId: 'static', providerType: 'static' },
      { providerId: 'google', providerType: 'google' },
      { providerId: 'aws', providerType: 'aws' },
      { providerId: 'azure', providerType: 'azure' },
    ]);
  });

  test('list providers pagination', async function() {
    let pages = 0;
    let providerIds = [];
    let query = { limit: 1 };
    while (true) {
      const res = await helper.workerManager.listProviders(query);
      pages += 1;
      res.providers.forEach(({ providerId }) => providerIds.push(providerId));
      if (res.continuationToken) {
        query.continuationToken = res.continuationToken;
      } else {
        break;
      }
    }

    assert.equal(pages, 6);
    assert.deepStrictEqual(providerIds.sort(),
      ['testing1', 'testing2', 'static', 'google', 'aws', 'azure'].sort());
  });

  const workerPoolCompare = (workerPoolId, input, result) => {
    const {
      created,
      lastModified,
      currentCapacity,
      requestedCount,
      runningCount,
      stoppingCount,
      stoppedCount,
      requestedCapacity,
      runningCapacity,
      stoppingCapacity,
      stoppedCapacity,
      ...definition
    } = result;
    assert(created);
    assert(lastModified);
    assert(currentCapacity !== undefined);
    assert(requestedCount !== undefined);
    assert(runningCount !== undefined);
    assert(stoppingCount !== undefined);
    assert(stoppedCount !== undefined);
    assert(requestedCapacity !== undefined);
    assert(runningCapacity !== undefined);
    assert(stoppingCapacity !== undefined);
    assert(stoppedCapacity !== undefined);
    assert.deepStrictEqual({ workerPoolId, ...input }, definition);
  };

  test('create worker pool', async function() {
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId, input,
      await helper.workerManager.createWorkerPool(workerPoolId, input));
    // check idempotency
    workerPoolCompare(workerPoolId, input,
      await helper.workerManager.createWorkerPool(workerPoolId, input));
    const workerPoolId2 = 'pp/ee2';
    const input2 = {
      providerId: 'testing1',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId2, input2,
      await helper.workerManager.createWorkerPool(workerPoolId2, input2));
  });

  test('create worker pool fails when pulse publish fails', async function() {
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });
    const apiClient = helper.workerManager.use({ retries: 0 });
    await assert.rejects(
      () => apiClient.createWorkerPool(workerPoolId, input),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({ Type, Fields }) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
  });

  test('update worker pool', async function() {
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    const initial = await helper.workerManager.createWorkerPool(workerPoolId, input);
    workerPoolCompare(workerPoolId, input, initial);
    const input2 = {
      providerId: 'testing2',
      description: 'bing',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
      // these should be ignored
      created: taskcluster.fromNow('10 days'),
      lastModified: taskcluster.fromNow('10 days'),
    };
    const updated = await helper.workerManager.updateWorkerPool(workerPoolId, input2);
    const { created: _1, lastModified: _2, ...expected } = input2;
    workerPoolCompare(workerPoolId, expected, updated);

    assert.equal(initial.lastModified, initial.created);
    assert.equal(initial.created, updated.created);
    assert(updated.lastModifed !== updated.created);
  });

  test('update worker pool fails when pulse publish fails', async function() {
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);

    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });

    input.description = 'foo';
    const apiClient = helper.workerManager.use({ retries: 0 });
    await assert.rejects(
      () => apiClient.updateWorkerPool(workerPoolId, input),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({ Type, Fields }) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
  });

  test('create worker pool (invalid providerId)', async function() {
    try {
      await helper.workerManager.createWorkerPool('pp/oo', {
        providerId: 'foo',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid providerId');
  });

  test('update worker pool (invalid workerPoolId)', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.updateWorkerPool('pp/oo', {
        workerPoolId: 'something/different',
        providerId: 'testing1',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid workerPoolId');
  });

  test('update worker pool (invalid providerId)', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.updateWorkerPool('pp/oo', {
        providerId: 'foo',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid providerId');
  });

  test('update worker pool to providerId = null-provider', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    await helper.workerManager.updateWorkerPool('pp/oo', {
      providerId: 'null-provider',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    const wp = await helper.workerManager.workerPool('pp/oo');
    assert.equal(wp.providerId, 'null-provider');
  });

  test('delete worker pool', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    await helper.workerManager.deleteWorkerPool('pp/oo');
    const wp = await helper.workerManager.workerPool('pp/oo');
    assert.equal(wp.providerId, 'null-provider');
  });

  test('create worker pool (already exists)', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.createWorkerPool('pp/oo', {
        providerId: 'testing2',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'RequestConflict') {
        throw err;
      }
      return;
    }
    throw new Error('creation of an already existing worker pool succeeded');
  });

  test('update worker pool (does not exist)', async function() {
    try {
      await helper.workerManager.updateWorkerPool('pp/oo', {
        providerId: 'testing1',
        description: 'e',
        config: {},
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('update of non-existent worker pool succeeded');
  });

  test('create worker pool (invalid config)', async function() {
    try {
      await helper.workerManager.createWorkerPool('pp/oo', {
        providerId: 'testing1',
        description: 'e',
        config: { bar: 'extra' },
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'InputValidationError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid config');
  });

  test('update worker pool (invalid config)', async function() {
    await helper.workerManager.createWorkerPool('pp/oo', {
      providerId: 'testing1',
      description: 'e',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    try {
      await helper.workerManager.updateWorkerPool('pp/oo', {
        providerId: 'testing1',
        description: 'e',
        config: { bar: 'extra' },
        owner: 'example@example.com',
        emailOnError: false,
      });
    } catch (err) {
      if (err.code !== 'InputValidationError') {
        throw err;
      }
      return;
    }
    throw new Error('Allowed to specify an invalid config');
  });

  test('get worker pool', async function() {
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);
    workerPoolCompare(workerPoolId, input, await helper.workerManager.workerPool(workerPoolId));
  });

  test('get worker pool (does not exist)', async function() {
    try {
      await helper.workerManager.workerPool('pp/oo');
    } catch (err) {
      if (err.code !== 'ResourceNotFound') {
        throw err;
      }
      return;
    }
    throw new Error('get of non-existent worker pool succeeded');
  });

  test('get worker pools - one worker pool', async function() {
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);
    let data = await helper.workerManager.listWorkerPools();

    data.workerPools.forEach( wp => {
      workerPoolCompare(workerPoolId, input, wp);
    });
  });

  const makeWorkerPools = async () => {
    const sampleWorkerPoolId = 'pp/ee';
    const sampleInput = {
      providerId: 'testing1',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };

    let input = [];

    for (let i of [0, 1, 2]) {
      const workerPoolId = `${sampleWorkerPoolId}-${i}`;
      const description = `pool ${i}`;
      input[i] = { workerPoolId, description, ...sampleInput };
    }

    await Promise.all(input.map(async i => {
      const { workerPoolId, ...definition } = i;
      await helper.workerManager.createWorkerPool(workerPoolId, definition);
    }));

    return input;
  };

  test('get worker pools - >1 worker pools', async function() {
    const input = await makeWorkerPools();
    const data = await helper.workerManager.listWorkerPools();
    assert(!data.continuationToken);
    data.workerPools.forEach( (wp, i) => {
      workerPoolCompare(input[i].workerPoolId, input[i], wp);
    });
  });

  test('get worker pools, paginated', async function() {
    const input = await makeWorkerPools();
    let data = await helper.workerManager.listWorkerPools({ limit: 1 });
    assert.equal(data.workerPools.length, 1);
    workerPoolCompare(input[0].workerPoolId, input[0], data.workerPools[0]);
    assert(data.continuationToken);

    data = await helper.workerManager.listWorkerPools({ limit: 1, continuationToken: data.continuationToken });
    assert.equal(data.workerPools.length, 1);
    workerPoolCompare(input[1].workerPoolId, input[1], data.workerPools[0]);
    assert(data.continuationToken);

    data = await helper.workerManager.listWorkerPools({ limit: 1, continuationToken: data.continuationToken });
    assert.equal(data.workerPools.length, 1);
    workerPoolCompare(input[2].workerPoolId, input[2], data.workerPools[0]);
    assert(!data.continuationToken);
  });

  test('get worker pools - no worker pools in db', async function() {
    let data = await helper.workerManager.listWorkerPools();

    assert.deepStrictEqual(data.workerPools, [], 'Should return an empty array of worker pools');
  });

  test('get 404 status when worker pool is not present', async function(){
    const workerPoolId = 'no/such';
    await assert.rejects(()=> helper.workerManager.listWorkersForWorkerPool(workerPoolId),
      /Worker Pool does not exist/);
  });

  test('get one worker for a given worker pool', async function () {
    const now = new Date();
    const input = {
      workerPoolId,
      providerId: 'google',
      workerGroup: 'rust-workers',
      workerId: 's-3434',
      created: now,
      lastModified: now,
      lastChecked: now,
      expires: taskcluster.fromNow('1 week'),
      state: Worker.states.REQUESTED,
      capacity: 1,
      providerData: {},
      secret: null,
    };

    await createWorkerPool();

    await createWorker(input);

    let data = await helper.workerManager.listWorkersForWorkerPool(workerPoolId);
    data.workers.forEach(worker => {
      assert(!('secret' in worker));
    });
    input.created = input.created.toJSON();
    input.expires = input.expires.toJSON();
    input.lastModified = input.lastModified.toJSON();
    input.lastChecked = input.lastChecked.toJSON();
    delete input.providerData;
    delete input.secret;

    assert.deepStrictEqual(data.workers, [input]);
  });

  test('get many workers for a given worker pool', async function () {
    let input = [
      {
        workerPoolId,
        providerId: 'google',
        workerGroup: 'rust-workers',
        workerId: 's-3434',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: Worker.states.RUNNING,
        capacity: 1,
        providerData: {},
        secret: null,
      },
      {
        workerPoolId,
        providerId: 'google',
        workerGroup: 'rust-workers',
        workerId: 's-555',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: Worker.states.STOPPED,
        capacity: 1,
        providerData: {},
        secret: null,
      },
    ];

    await createWorkerPool();

    await Promise.all(input.map(i => createWorker(i)));

    input = input.map(i => {
      i.created = i.created.toJSON();
      i.expires = i.expires.toJSON();
      i.lastModified = i.lastModified.toJSON();
      i.lastChecked = i.lastChecked.toJSON();
      delete i.providerData;
      delete i.secret;
      return i;
    });

    let data = await helper.workerManager.listWorkersForWorkerPool(workerPoolId);
    data.workers.forEach(worker => {
      assert(!('secret' in worker));
    });

    assert.deepStrictEqual(data.workers, input);
  });

  test('get workers for a given worker pool - no workers', async function () {
    await createWorkerPool();
    let data = await helper.workerManager.listWorkersForWorkerPool(workerPoolId);
    data.workers.forEach(worker => {
      assert(!('secret' in worker));
    });

    assert.deepStrictEqual(data.workers, []);
  });

  test('list workers for a given worker pool and group', async function () {
    const workerPoolId = 'apple/apple';
    let input = ['wg-a', 'wg-b'].map(workerGroup => ({
      workerPoolId,
      providerId: 'google',
      workerGroup,
      workerId: 's-3434',
      created: new Date(),
      lastModified: new Date(),
      lastChecked: new Date(),
      expires: taskcluster.fromNow('1 week'),
      capacity: 1,
      state: Worker.states.RUNNING,
      providerData: {},
      secret: null,
    }));

    await Promise.all(input.map(i => createWorker(i)));

    input = input.map(i => {
      i.created = i.created.toJSON();
      i.expires = i.expires.toJSON();
      i.lastModified = i.lastModified.toJSON();
      i.lastChecked = i.lastChecked.toJSON();
      delete i.providerData;
      return i;
    });

    let data = await helper.workerManager.listWorkersForWorkerGroup(workerPoolId, 'wg-a');

    data.workers.forEach(worker => {
      assert(!('secret' in worker));
    });

    delete input[0].secret;
    assert.deepStrictEqual(data.workers, [input[0]]);
  });

  test('get a specific worker', async function () {
    const workerPoolId = 'apple/apple';
    const input = {
      workerPoolId,
      providerId: 'google',
      workerGroup: 'wg-a',
      workerId: 's-3434',
      created: new Date(),
      lastModified: new Date(),
      lastChecked: new Date(),
      expires: taskcluster.fromNow('1 week'),
      capacity: 1,
      state: Worker.states.RUNNING,
      providerData: {},
      secret: null,
    };

    await createWorker(input);
    const data = await helper.workerManager.worker(workerPoolId, 'wg-a', 's-3434');
    const worker = await Worker.get(helper.db, {
      workerPoolId: input.workerPoolId,
      workerGroup: input.workerGroup,
      workerId: input.workerId,
    });
    const expected = worker.serializable({ removeQueueData: true });

    assert(!('secret' in data));
    assert.deepStrictEqual(data, expected);
  });

  test('get a specific worker that does not exist', async function () {
    const workerPoolId = 'apple/apple';
    await assert.rejects(() =>
      helper.workerManager.worker(workerPoolId, 'wg-a', 's-3434'), { statusCode: 404 });
  });

  suite('worker creation / update / removal', function() {
    test('create a worker for a worker pool that does not exist', async function () {
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), new RegExp(`Worker pool ${workerPoolId} does not exist`));
    });

    test('create a pre-expired worker', async function () {
      await createWorkerPool({});
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('-1 hour'),
          capacity: 1,
        }), /expires must be in the future/);
    });

    test('create a worker for a worker pool with invalid providerId', async function () {
      await createWorkerPool({ providerId: 'nosuch' });
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /Provider nosuch for worker pool/);
    });

    test('create a worker for a provider that does not want it', async function () {
      await createWorkerPool({});
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /creating workers is not supported/);
    });

    test('create a worker with a too-long workerId', async function () {
      const longWorkerId = 'a-really-long-worker-id-123456789123456789';
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, longWorkerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /workerId.*must match regular/);
    });

    test('create a worker with a too-long workerGroup', async function () {
      const longWorkerGroup = 'a-really-long-worker-group-123456789123456789';
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, longWorkerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /workerGroup.*must match regular/);
    });

    test('create a worker for a provider that does want it', async function () {
      await createWorkerPool({
        providerData: { allowCreateWorker: true },
      });

      const expires = taskcluster.fromNow('1 hour');
      const worker = await helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
        expires,
      });

      assert(!('secret' in worker));
      assert.equal(worker.workerPoolId, workerPoolId);
      assert.equal(worker.workerGroup, workerGroup);
      assert.equal(worker.workerId, workerId);
      assert.equal(worker.providerId, providerId);
      assert.equal(worker.expires, expires.toJSON());
    });

    test('update a worker for a worker pool that does not exist', async function () {
      await assert.rejects(() =>
        helper.workerManager.updateWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), new RegExp(`Worker pool ${workerPoolId} does not exist`));
    });

    test('update a worker for a worker pool with invalid providerId', async function () {
      await createWorkerPool({ providerId: 'nosuch' });
      await assert.rejects(() =>
        helper.workerManager.updateWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /Provider nosuch for worker pool/);
    });

    test('update a worker for a provider that does not want it', async function () {
      await createWorkerPool({});
      await createWorker({});
      await assert.rejects(() =>
        helper.workerManager.updateWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /updating workers is not supported/);
    });

    test('update a worker for a provider that wants and appreciates it', async function () {
      await createWorkerPool({
        providerData: { allowUpdateWorker: true },
      });
      await createWorker({});
      const worker = await helper.workerManager.updateWorker(
        workerPoolId,
        workerGroup,
        workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 2,
        });
      assert.deepEqual(worker.capacity, 2);
    });

    test('remove a worker that does not exist', async function () {
      await assert.rejects(() =>
        helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId),
      /Worker not found/);
    });

    test('remove a worker that has an invalid provider', async function () {
      await createWorker({
        providerId: 'nosuch',
      });
      await assert.rejects(() =>
        helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId),
      /Provider nosuch for this worker does not exist/);
    });

    test('remove a worker for a provider that does not want to', async function () {
      await createWorker({
        providerData: { allowRemoveWorker: false },
      });
      await assert.rejects(() =>
        helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId),
      /removing workers is not supported/);
    });

    test('remove a worker for a provider that does want to', async function () {
      await createWorker({
        providerData: { allowRemoveWorker: true },
      });
      await helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId);
      const worker = await Worker.get(helper.db, { workerPoolId, workerGroup, workerId });
      assert.equal(worker.state, 'stopped');
    });
  });

  test('Report a worker error', async function() {
    const workerPoolId = 'foobar/baz';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);

    await helper.workerManager.reportWorkerError(workerPoolId, {
      workerGroup: 'wg',
      workerId: 'wi',
      kind: "worker-error",
      title: 'Something is Wrong',
      description: 'Uhoh!',
      extra: { amISure: true },
    });

    let data = await helper.workerManager.listWorkerPoolErrors(workerPoolId);

    assert.equal(data.workerPoolErrors.length, 1);

    assert(data.workerPoolErrors[0].reported);
    delete data.workerPoolErrors[0].reported;
    assert(data.workerPoolErrors[0].errorId);
    delete data.workerPoolErrors[0].errorId;

    assert.deepEqual(data.workerPoolErrors, [
      {
        workerPoolId,
        kind: "worker-error",
        title: 'Something is Wrong',
        description: 'Uhoh!',
        extra: {
          workerGroup: 'wg',
          workerId: 'wi',
          amISure: true,
        },
      },
    ]);
  });

  test('Report a worker error, no such pool', async function() {
    await assert.rejects(async () =>
      await helper.workerManager.reportWorkerError('no/such', {
        workerGroup: 'wg',
        workerId: 'wi',
        kind: "worker-error",
        title: 'Something is Wrong',
        description: 'Uhoh!',
        extra: { amISure: true },
      }),
    /Worker pool does not exist/,
    );
  });

  test('get worker pool errors - no errors in db', async function() {
    let data = await helper.workerManager.listWorkerPoolErrors('foobar/baz');

    assert.deepStrictEqual(data.workerPoolErrors, [], 'Should return an empty array of worker pool errors');
  });

  test('get worker pool errors - single', async function() {
    const workerPoolId = 'foobar/baz';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId, input,
      await helper.workerManager.createWorkerPool(workerPoolId, input));

    await helper.workerManager.reportWorkerError(workerPoolId, {
      kind: 'something-error',
      workerGroup: 'wg',
      workerId: 'wid',
      title: 'And Error about Something',
      description: 'WHO KNOWS',
      extra: {
        foo: 'bar-123-456',
      },
    });

    let data = await helper.workerManager.listWorkerPoolErrors('foobar/baz');

    assert.equal(data.workerPoolErrors.length, 1);

    assert(data.workerPoolErrors[0].reported);
    delete data.workerPoolErrors[0].reported;
    assert(data.workerPoolErrors[0].errorId);
    delete data.workerPoolErrors[0].errorId;

    assert.deepEqual(data.workerPoolErrors, [
      {
        description: "WHO KNOWS",
        extra: {
          foo: "bar-123-456",
          workerGroup: 'wg',
          workerId: 'wid',
        },
        kind: "something-error",
        title: "And Error about Something",
        workerPoolId: "foobar/baz",
      },
    ]);
  });

  test('get worker pool errors - multiple', async function() {
    const workerPoolId = 'foobar/baz';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId, input,
      await helper.workerManager.createWorkerPool(workerPoolId, input));

    await helper.workerManager.reportWorkerError(workerPoolId, {
      kind: 'something-error',
      workerGroup: 'wg',
      workerId: 'wid',
      title: 'And Error about Something',
      description: 'WHO KNOWS',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
      extra: {
        foo: 'bar-123-456',
      },
    });

    await helper.workerManager.reportWorkerError(workerPoolId, {
      kind: 'another-error',
      workerGroup: 'wg',
      workerId: 'wid',
      title: 'And Error about another something',
      description: 'huh',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
      extra: {},
    });

    let data = await helper.workerManager.listWorkerPoolErrors('foobar/baz');

    assert.strictEqual(data.workerPoolErrors.length, 2);

    data.workerPoolErrors.forEach(wpe => {
      assert(wpe.reported);
      delete wpe.reported;
      assert(wpe.errorId);
      delete wpe.errorId;
    });

    // should be ordered by reported desc, so
    // first inserted comes second
    assert.deepStrictEqual(data.workerPoolErrors, [
      {
        description: "huh",
        extra: {
          workerGroup: 'wg',
          workerId: 'wid',
        },
        kind: "another-error",
        title: "And Error about another something",
        workerPoolId: "foobar/baz",
      },
      {
        description: "WHO KNOWS",
        extra: {
          foo: "bar-123-456",
          workerGroup: 'wg',
          workerId: 'wid',
        },
        kind: "something-error",
        title: "And Error about Something",
        workerPoolId: "foobar/baz",
      },
    ]);
  });

  const googleInput = {
    providerId: 'google',
    description: 'bar',
    config: {
      minCapacity: 1,
      maxCapacity: 1,
      scalingRatio: 1,
      launchConfigs: [
        {
          capacityPerInstance: 1,
          machineType: 'n1-standard-2',
          region: 'us-east1',
          zone: 'us-east1-a',
          workerConfig: {},
          scheduling: {},
          networkInterfaces: [],
          disks: [],
        },
      ],
    },
    owner: 'example@example.com',
    emailOnError: false,
  };

  test('create (google) worker pool', async function() {
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
  });

  suite('registerWorker', function() {
    const providerId = 'testing1';
    const workerGroup = 'wg';
    const workerId = 'wi';
    const workerIdentityProof = { 'token': 'tok' };

    suiteSetup(function() {
      helper.load.save();

      // create fake clientId / accessToken for temporary creds
      helper.load.cfg('taskcluster.credentials.clientId', 'fake');
      helper.load.cfg('taskcluster.credentials.accessToken', 'fake');
    });

    suiteTeardown(function() {
      helper.load.restore();
    });

    const defaultRegisterWorker = {
      workerPoolId, providerId, workerGroup, workerId, workerIdentityProof,
    };

    test('no such workerPool', async function() {
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        workerPoolId: 'no/such',
      }), /Worker pool no\/such does not exist/);
    });

    test('no such provider', async function() {
      const providerId = 'no-such';
      await createWorkerPool({
        providerId,
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        providerId,
      }), /Provider no-such does not exist/);
    });

    test('provider not associated', async function() {
      await createWorkerPool({
        providerId: 'testing2',
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        providerId: 'testing1',
      }), /Worker pool pp\/ee not associated with provider testing1/);
    });

    test('no such worker', async function() {
      await createWorkerPool({
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /Worker wg\/wi in worker pool pp\/ee does not exist/);
    });

    test('worker requests across pools', async function() {
      await createWorkerPool({ workerPoolId: 'ff/ee' });
      await createWorkerPool({ workerPoolId: 'ff/tt' });
      await createWorker({
        workerPoolId: 'ff/tt',
      });

      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        workerPoolId: 'ff/ee', // This is _not_ the pool this worker is in
      }), /Worker wg\/wi in worker pool ff\/ee does not exist/);

    });

    test('worker does not have providerId', async function() {
      await createWorkerPool({});
      await createWorker({
        providerId: 'testing2',
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /Worker wg\/wi does not have provider testing1/);
    });

    test('error from prov.registerWorker', async function() {
      await createWorkerPool({});
      await createWorker({
        providerData: { failRegister: 'uhoh' },
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /uhoh/);
    });

    test('sweet success', async function() {
      await createWorkerPool({});
      await createWorker({
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const res = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      });

      assert.equal(res.credentials.clientId,
        `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);

      assert.equal(res.workerConfig.someKey, "someValue");

      // cheat a little and look in the certificate to check the scopes
      const scopes = new Set(JSON.parse(res.credentials.certificate).scopes);
      const msg = `got scopes ${[...scopes].join(', ')}`;
      assert(scopes.has(`assume:worker-pool:${workerPoolId}`), msg);
      assert(scopes.has(`assume:worker-id:${workerGroup}/${workerId}`), msg);
      assert(scopes.has(`secrets:get:worker-pool:${workerPoolId}`), msg);
      assert(scopes.has(`queue:claim-work:${workerPoolId}`), msg);
      assert(scopes.has(`worker-manager:reregister-worker:${workerPoolId}/${workerGroup}/${workerId}`), msg);
    });

    test('sweet success for a previous providerId', async function() {
      await createWorkerPool({
        providerId: 'testing2',
        previousProviderIds: ['testing1'],
      });
      await createWorker({});
      const res = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      });

      assert.equal(res.credentials.clientId,
        `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);
    });

    test('[Integration] Successful registering an AWS worker', async function() {
      const awsProviderId = 'aws';
      const awsWorkerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };
      const awsWorkerIdentityProofParsed = JSON.parse(awsWorkerIdentityProof.document);

      await createWorkerPool({
        providerId: awsProviderId,
      });
      await createWorker({
        workerId: awsWorkerIdentityProofParsed.instanceId,
        providerId: awsProviderId,
        providerData: {
          region: awsWorkerIdentityProofParsed.region,
          imageId: awsWorkerIdentityProofParsed.imageId,
          instanceType: awsWorkerIdentityProofParsed.instanceType,
          architecture: awsWorkerIdentityProofParsed.architecture,
          availabilityZone: awsWorkerIdentityProofParsed.availabilityZone,
          privateIp: awsWorkerIdentityProofParsed.privateIp,
          owner: awsWorkerIdentityProofParsed.accountId,
        },
      });

      const res = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        workerId: awsWorkerIdentityProofParsed.instanceId,
        providerId: awsProviderId,
        workerIdentityProof: awsWorkerIdentityProof,
      });

      assert.equal(res.credentials.clientId,
        `worker/${awsProviderId}/${workerPoolId}/${workerGroup}/${awsWorkerIdentityProofParsed.instanceId}`,
      );

      const scopes = new Set(JSON.parse(res.credentials.certificate).scopes);
      const msg = `got scopes ${[...scopes].join(', ')}`;
      assert(scopes.has(`assume:worker-pool:${workerPoolId}`), msg);
      assert(scopes.has(`assume:worker-id:${workerGroup}/${awsWorkerIdentityProofParsed.instanceId}`), msg);
      assert(scopes.has(`secrets:get:worker-pool:${workerPoolId}`), msg);
      assert(scopes.has(`queue:claim-work:${workerPoolId}`), msg);
      assert(scopes.has(`worker-manager:reregister-worker:${workerPoolId}/${workerGroup}/${awsWorkerIdentityProofParsed.instanceId}`), msg);
    });
  });

  suite('reregisterWorker', function() {
    const providerId = 'testing1';
    const workerGroup = 'wg';
    const workerId = 'wi';
    const workerIdentityProof = { 'token': 'tok' };

    suiteSetup(function() {
      helper.load.save();

      // create fake clientId / accessToken for temporary creds
      helper.load.cfg('taskcluster.credentials.clientId', 'fake');
      helper.load.cfg('taskcluster.credentials.accessToken', 'fake');
    });

    suiteTeardown(function() {
      helper.load.restore();
    });

    const defaultRegisterWorker = {
      workerPoolId, providerId, workerGroup, workerId, workerIdentityProof,
    };

    const testExpires = async (config) => {
      await createWorkerPool({});
      const worker = await createWorker(config);
      // default is 96 hours when reregistrationTimeout is not specified.
      // This is in milliseconds because interpretLifecycle does that math
      // _before_ it is stored in the db the first time so now reregister
      // works from that math
      const reregistrationTimeout = config.providerData.reregistrationTimeout ?
        config.providerData.reregistrationTimeout :
        96 * 3600 * 1000;

      const firstResponse = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      });

      assert.equal(firstResponse.credentials.clientId,
        `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);

      // This will use the values set by register in the first place
      const secondResponse = await helper.workerManager.reregisterWorker({
        workerPoolId,
        workerGroup,
        workerId,
        secret: firstResponse.secret,
      });

      assert(new Date(secondResponse.expires) - new Date() > reregistrationTimeout - 250);
      assert(new Date(secondResponse.expires) - new Date() < reregistrationTimeout + 250);
      assert.equal(firstResponse.credentials.clientId, secondResponse.credentials.clientId);
      assert.notStrictEqual(firstResponse.secret, secondResponse.secret);

      await worker.reload(helper.db);
      if (worker.providerData.terminateAfter) {
        assert.equal(worker.providerData.terminateAfter, new Date(secondResponse.expires).getTime());
      }

      // This time will use the values set by reregister (notice the re in front) the first time
      // it is called (the secondResponse thing above)
      const thirdResponse = await helper.workerManager.reregisterWorker({
        workerPoolId,
        workerGroup,
        workerId,
        secret: secondResponse.secret,
      });

      assert(new Date(thirdResponse.expires) - new Date() > reregistrationTimeout - 250);
      assert(new Date(thirdResponse.expires) - new Date() < reregistrationTimeout + 250);
      assert.equal(secondResponse.credentials.clientId, thirdResponse.credentials.clientId);
      assert.notStrictEqual(secondResponse.secret, thirdResponse.secret);

      await worker.reload(helper.db);
      if (worker.providerData.terminateAfter) {
        assert.equal(worker.providerData.terminateAfter, new Date(thirdResponse.expires).getTime());
      }
    };

    test('works without reregistrationTimeout', async function() {
      const config = {
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      };
      await testExpires(config);
    });

    test('works with reregistrationTimeout', async function() {
      const config = {
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
          // 2 hour
          reregistrationTimeout: 2 * 60 * 60 * 1000, // this is stored in milliseconds
        },
      };
      await testExpires(config);
    });

    test('works with terminateAfter', async function() {
      const config = {
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
          // 2 hour
          reregistrationTimeout: 2 * 60 * 60 * 1000, // this is stored in milliseconds
          terminateAfter: taskcluster.fromNow('1 day').getTime(),
        },
      };
      await testExpires(config);
    });

    test('throws when secret is bad', async function() {
      await createWorkerPool({});
      await createWorker({
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const firstResponse = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      });

      assert.equal(firstResponse.credentials.clientId,
        `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);

      await assert.rejects(
        async () => {
          await helper.workerManager.reregisterWorker({
            workerPoolId,
            workerGroup,
            workerId,
            secret: `${slug.nice()}${slug.nice()}`,
          });
        },
        /Could not generate credentials for this secret/,
      );
    });

    test('throws when worker does not exist', async function() {
      await createWorkerPool({});
      await createWorker({
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const firstResponse = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      });

      assert.equal(firstResponse.credentials.clientId,
        `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);

      await assert.rejects(
        async () => {
          await helper.workerManager.reregisterWorker({
            workerPoolId: 'does-not/exist',
            workerGroup,
            workerId,
            secret: firstResponse.secret,
          });
        },
        /Could not generate credentials for this secret/,
      );
    });

    test('throws when secret is not defined', async function() {
      await createWorkerPool({});
      await createWorker({
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      });
      const firstResponse = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      });

      assert.equal(firstResponse.credentials.clientId,
        `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);

      await assert.rejects(
        async () => {
          await helper.workerManager.reregisterWorker({
            workerPoolId,
            workerGroup,
            workerId,
            secret: null,
          });
        },
        /Schema Validation Failed/,
      );
    });
  });

  suite('ensure 403s when required', function() {
    test('listProviders without scopes', async function() {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listProviders(),
        err => err.code === 'InsufficientScopes');
    });
    test('workerPool without scopes', async function() {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.workerPool('aa/bb'),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkerPools without scopes', async function() {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkerPools(),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkerPoolErrors without scopes', async function() {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkerPoolErrors('aa/bb'),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkersForWorkerPool without scopes', async function() {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkersForWorkerPool('aa/bb'),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkersForWorkerGroup without scopes', async function() {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkersForWorkerGroup('aa/bb', 'ff'),
        err => err.code === 'InsufficientScopes');
    });
    test('worker without scopes', async function() {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.worker('aa/bb', 'ff', 'i-123'),
        err => err.code === 'InsufficientScopes');
    });
  });
});
