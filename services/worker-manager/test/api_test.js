const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.workerManager.ping();
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
    const input = {
      workerPoolId,
      providerId: 'google',
      workerGroup: 'rust-workers',
      workerId: 's-3434',
      created: new Date(),
      expires: taskcluster.fromNow('1 week'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    };

    await helper.Worker.create(input);

    let data = await helper.workerManager.listWorkersForWorkerPool(workerPoolId);
    input.created = input.created.toJSON();
    input.expires = input.expires.toJSON();
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
        expires: taskcluster.fromNow('1 week'),
        state: helper.Worker.states.RUNNING,
        providerData: {},
      },
      {
        workerPoolId,
        providerId: 'google',
        workerGroup: 'rust-workers',
        workerId: 's-555',
        created: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: helper.Worker.states.STOPPED,
        providerData: {},
      },
    ];

    await Promise.all(input.map(i => helper.Worker.create(i)));

    input = input.map(i => {
      i.created = i.created.toJSON();
      i.expires = i.expires.toJSON();
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

    assert.equal(data.workerPoolErrors.length, 2);

    data.workerPoolErrors.forEach(wpe => {
      assert(wpe.reported);
      delete wpe.reported;
      assert(wpe.errorId);
      delete wpe.errorId;
    });

    // Just sort on an arbitrary field
    const sorter = (x, y) => x.kind > y.kind;

    assert.deepEqual(data.workerPoolErrors.sort(sorter), [
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
      capacityPerInstance: 1,
      machineType: 'n1-standard-2',
      regions: ['us-east1'],
      userData: {},
      scheduling: {},
      networkInterfaces: [],
      disks: [],
    },
    owner: 'example@example.com',
    emailOnError: false,
  };

  test('create (google) worker pool', async function() {
    const workerPoolId = 'pp/ee';
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
  });

  test('credentials google', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'abc123',
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
  });

  test('credentials google (but wrong worker)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'gcp',
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong worker!');
  });

  test('credentials google (but invalid providerId)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'gcp',
      providerId: 'NO-SUCH',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    await helper.WorkerPool.create({
      workerPoolId,
      providerId: 'NO-SUCH',
      previousProviderIds: ['NO-SUCH'],
      description: '',
      created: new Date(),
      lastModified: new Date(),
      config: {},
      owner: 'me@example.com',
      emailOnError: false,
      providerData: {},
    });

    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong worker!');
  });

  test('credentials google (but wrong worker pool)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId: 'wrong',
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong worker pool!');
  });

  test('credentials google (second fetch fails)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));

    await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'abc'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed second fetch of creds');
  });

  test('credentials google (but wrong project in token)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'wrongProject'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong project!');
  });

  test('credentials google (but wrong instance id in token)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'wrongId'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong id!');
  });

  test('credentials google (but wrong service account in token)', async function() {
    const workerPoolId = 'pp/ee';
    await helper.Worker.create({
      workerPoolId,
      workerGroup: 'google',
      workerId: 'abc123', // TODO: Don't just copy-paste this from fake-google
      providerId: 'google',
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
    try {
      await helper.workerManager.credentialsGoogle(workerPoolId, {token: 'wrongSub'});
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      return;
    }
    throw new Error('allowed fetch of credentials from wrong service account!');
  });

});
