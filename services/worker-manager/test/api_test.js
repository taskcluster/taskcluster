const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const fs = require('fs');
const path = require('path');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.workerManager.ping();
  });

  test('list providers', async function() {
    const {providers} = await helper.workerManager.listProviders();
    assert.deepStrictEqual(providers.sort(), [
      {providerId: 'testing1', providerType: 'testing'},
      {providerId: 'testing2', providerType: 'testing'},
      {providerId: 'static', providerType: 'static'},
      {providerId: 'google', providerType: 'google'},
      {providerId: 'aws', providerType: 'aws'},
    ].sort());
  });

  test('list providers pagination', async function() {
    let pages = 0;
    let providerIds = [];
    let query = {limit: 1};
    while (true) {
      const res = await helper.workerManager.listProviders(query);
      pages += 1;
      res.providers.forEach(({providerId}) => providerIds.push(providerId));
      if (res.continuationToken) {
        query.continuationToken = res.continuationToken;
      } else {
        break;
      }
    }

    assert.equal(pages, 5);
    assert.deepStrictEqual(providerIds.sort(),
      ['testing1', 'testing2', 'static', 'google', 'aws'].sort());
  });

  const workerPoolCompare = (workerPoolId, input, result) => {
    const {created, lastModified, ...definition} = result;
    assert(created);
    assert(lastModified);
    assert.deepStrictEqual({workerPoolId, ...input}, definition);
  };

  test('create worker pool', async function() {
    const workerPoolId = 'pp/ee';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
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

  test('update worker pool', async function() {
    const workerPoolId = 'pp/ee';
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
    const {created: _1, lastModified: _2, ...expected} = input2;
    workerPoolCompare(workerPoolId, expected, updated);

    assert.equal(initial.lastModified, initial.created);
    assert.equal(initial.created, updated.created);
    assert(updated.lastModifed !== updated.created);
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
        config: {bar: 'extra'},
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
        config: {bar: 'extra'},
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
    const workerPoolId = 'pp/ee';
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
    const workerPoolId = 'pp/ee';
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

  test('get worker pools - >1 worker pools', async function() {
    const sampleWorkerPoolId = 'pp/ee';
    const sampleInput = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };

    let input = [];

    for (let i of [0, 1, 2]) {
      const workerPoolId = `${sampleWorkerPoolId}-${i}`;
      input[i] = {workerPoolId, ...sampleInput};
    }

    await Promise.all(input.map(async i => {
      const {workerPoolId, ...definition} = i;
      await helper.workerManager.createWorkerPool(workerPoolId, definition);
    }));

    let data = await helper.workerManager.listWorkerPools();

    data.workerPools.forEach( (wp, i) => {
      workerPoolCompare(input[i].workerPoolId, input[i], wp);
    });
  });

  test('get worker pools - no worker pools in db', async function() {
    let data = await helper.workerManager.listWorkerPools();

    assert.deepStrictEqual(data.workerPools, [], 'Should return an empty array of worker pools');
  });

  test('get one worker for a given worker pool', async function () {
    const workerPoolId = 'r/r';
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
      state: helper.Worker.states.REQUESTED,
      capacity: 1,
      providerData: {},
    };

    await helper.Worker.create(input);

    let data = await helper.workerManager.listWorkersForWorkerPool(workerPoolId);
    input.created = input.created.toJSON();
    input.expires = input.expires.toJSON();
    input.lastModified = input.lastModified.toJSON();
    input.lastChecked = input.lastChecked.toJSON();
    delete input.providerData;

    assert.deepStrictEqual(data.workers, [input]);
  });

  test('get many workers for a given worker pool', async function () {
    const workerPoolId = 'apple/apple';
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
        state: helper.Worker.states.RUNNING,
        capacity: 1,
        providerData: {},
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
        state: helper.Worker.states.STOPPED,
        capacity: 1,
        providerData: {},
      },
    ];

    await Promise.all(input.map(i => helper.Worker.create(i)));

    input = input.map(i => {
      i.created = i.created.toJSON();
      i.expires = i.expires.toJSON();
      i.lastModified = i.lastModified.toJSON();
      i.lastChecked = i.lastChecked.toJSON();
      delete i.providerData;
      return i;
    });

    let data = await helper.workerManager.listWorkersForWorkerPool(workerPoolId);

    assert.deepStrictEqual(data.workers, input);
  });

  test('get workers for a given worker pool - no workers', async function () {
    const workerPoolId = 'r/r';

    let data = await helper.workerManager.listWorkersForWorkerPool(workerPoolId);

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
      state: helper.Worker.states.RUNNING,
      providerData: {},
    }));

    await Promise.all(input.map(i => helper.Worker.create(i)));

    input = input.map(i => {
      i.created = i.created.toJSON();
      i.expires = i.expires.toJSON();
      i.lastModified = i.lastModified.toJSON();
      i.lastChecked = i.lastChecked.toJSON();
      delete i.providerData;
      return i;
    });

    let data = await helper.workerManager.listWorkersForWorkerGroup(workerPoolId, 'wg-a');

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
      state: helper.Worker.states.RUNNING,
      providerData: {},
    };

    const entity = await helper.Worker.create(input);
    const data = await helper.workerManager.worker(workerPoolId, 'wg-a', 's-3434');

    assert.deepStrictEqual(data, entity.serializable());
  });

  test('get a specific worker that does not exist', async function () {
    const workerPoolId = 'apple/apple';
    await assert.rejects(() =>
      helper.workerManager.worker(workerPoolId, 'wg-a', 's-3434'), {statusCode: 404});
  });

  suite('worker creation / removal', function() {
    const workerPoolId = 'ff/ee';
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

    test('create a worker for a worker pool that does not exist', async function () {
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), new RegExp(`Worker pool ${workerPoolId} does not exist`));
    });

    test('create a pre-expired worker', async function () {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
      });
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('-1 hour'),
          capacity: 1,
        }), /expires must be in the future/);
    });

    test('create a worker for a worker pool with invalid providerId', async function () {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        providerId: 'nosuch',
      });
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /Provider nosuch for worker pool/);
    });

    test('create a worker for a provider that does not want it', async function () {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
      });
      await assert.rejects(() =>
        helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
        }), /creating workers is not supported/);
    });

    test('create a worker for a provider that does want it', async function () {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        providerData: {allowCreateWorker: true},
      });

      const expires = taskcluster.fromNow('1 hour');
      const worker = await helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
        expires,
      });

      assert.equal(worker.workerPoolId, workerPoolId);
      assert.equal(worker.workerGroup, workerGroup);
      assert.equal(worker.workerId, workerId);
      assert.equal(worker.providerId, providerId);
      assert.equal(worker.expires, expires.toJSON());
    });

    test('remove a worker that does not exist', async function () {
      await assert.rejects(() =>
        helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId),
      /Worker not found/);
    });

    test('remove a worker that has an invalid provider', async function () {
      await helper.Worker.create({
        ...defaultWorker,
        providerId: 'nosuch',
      });
      await assert.rejects(() =>
        helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId),
      /Provider nosuch for this worker does not exist/);
    });

    test('remove a worker for a provider that does not want to', async function () {
      await helper.Worker.create({
        ...defaultWorker,
        providerData: {allowRemoveWorker: false},
      });
      await assert.rejects(() =>
        helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId),
      /removing workers is not supported/);
    });

    test('remove a worker for a provider that does want to', async function () {
      await helper.Worker.create({
        ...defaultWorker,
        providerData: {allowRemoveWorker: true},
      });
      await helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId);
      const worker = await helper.Worker.load({workerPoolId, workerGroup, workerId});
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
      extra: {amISure: true},
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
        extra: {amISure: true},
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

    const wp = await helper.WorkerPool.load({
      workerPoolId,
    });

    await wp.reportError({
      kind: 'something-error',
      title: 'And Error about Something',
      description: 'WHO KNOWS',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
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

    const wp = await helper.WorkerPool.load({
      workerPoolId,
    });

    await wp.reportError({
      kind: 'something-error',
      title: 'And Error about Something',
      description: 'WHO KNOWS',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
      extra: {
        foo: 'bar-123-456',
      },
    });

    await wp.reportError({
      kind: 'another-error',
      title: 'And Error about another something',
      description: 'huh',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
    });

    let data = await helper.workerManager.listWorkerPoolErrors('foobar/baz');

    assert.strictEqual(data.workerPoolErrors.length, 2);

    data.workerPoolErrors.forEach(wpe => {
      assert(wpe.reported);
      delete wpe.reported;
      assert(wpe.errorId);
      delete wpe.errorId;
    });

    // Just sort on an arbitrary field
    const sorter = (x, y) => x.kind.localeCompare(y.kind);

    assert.deepStrictEqual(data.workerPoolErrors.sort(sorter), [
      {
        description: "huh",
        extra: {},
        kind: "another-error",
        title: "And Error about another something",
        workerPoolId: "foobar/baz",
      }, {
        description: "WHO KNOWS",
        extra: {
          foo: "bar-123-456",
        },
        kind: "something-error",
        title: "And Error about Something",
        workerPoolId: "foobar/baz",
      },
    ].sort(sorter));
  });

  const googleInput = {
    providerId: 'google',
    description: 'bar',
    config: {
      minCapacity: 1,
      maxCapacity: 1,
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
    const workerPoolId = 'pp/ee';
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
  });

  suite('registerWorker', function() {
    const workerPoolId = 'ff/ee';
    const providerId = 'testing1';
    const workerGroup = 'wg';
    const workerId = 'wi';
    const workerIdentityProof = {'token': 'tok'};

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
      created: taskcluster.fromNow('0 seconds'),
      expires: taskcluster.fromNow('90 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      capacity: 1,
      state: 'requested',
      providerData: {},
    };

    test('no such workerPool', async function() {
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        workerPoolId: 'no/such',
      }), /Worker pool no\/such does not exist/);
    });

    test('no such provider', async function() {
      const providerId = 'no-such';
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        providerId,
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        providerId,
      }), /Provider no-such does not exist/);
    });

    test('provider not associated', async function() {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        providerId: 'testing2',
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        providerId: 'testing1',
      }), /Worker pool ff\/ee not associated with provider testing1/);
    });

    test('no such worker', async function() {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /Worker wg\/wi in worker pool ff\/ee does not exist/);
    });

    test('worker requests across pools', async function() {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        workerPoolId: 'ff/ee',
      });
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        workerPoolId: 'ff/tt',
      });
      await helper.Worker.create({
        ...defaultWorker,
        workerPoolId: 'ff/tt',
      });

      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        workerPoolId: 'ff/ee', // This is _not_ the pool this worker is in
      }), /Worker wg\/wi in worker pool ff\/ee does not exist/);

    });

    test('worker does not have providerId', async function() {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
      });
      await helper.Worker.create({
        ...defaultWorker,
        providerId: 'testing2',
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /Worker wg\/wi does not have provider testing1/);
    });

    test('error from prov.registerWorker', async function() {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
      });
      await helper.Worker.create({
        ...defaultWorker,
        providerData: {failRegister: 'uhoh'},
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /uhoh/);
    });

    test('sweet success', async function() {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
      });
      await helper.Worker.create({
        ...defaultWorker,
      });
      const res = await helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      });

      assert.equal(res.credentials.clientId,
        `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);

      // cheat a little and look in the certificate to check the scopes
      const scopes = new Set(JSON.parse(res.credentials.certificate).scopes);
      const msg = `got scopes ${[...scopes].join(', ')}`;
      assert(scopes.has(`assume:worker-pool:${workerPoolId}`), msg);
      assert(scopes.has(`assume:worker-id:${workerGroup}/${workerId}`), msg);
      assert(scopes.has(`secrets:get:worker-pool:${workerPoolId}`), msg);
      assert(scopes.has(`queue:claim-work:${workerPoolId}`), msg);
    });

    test('sweet success for a previous providerId', async function() {
      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        providerId: 'testing2',
        previousProviderIds: ['testing1'],
      });
      await helper.Worker.create({
        ...defaultWorker,
      });
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

      await helper.WorkerPool.create({
        ...defaultWorkerPool,
        providerId: awsProviderId,
      });
      await helper.Worker.create({
        ...defaultWorker,
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
    });
  });
});
