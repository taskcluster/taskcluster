import taskcluster from '@taskcluster/client';
import slug from 'slugid';
import assert from 'assert';
import helper from './helper.js';
import { WorkerPool, Worker } from '../src/data.js';
import testing from '@taskcluster/lib-testing';
import fs from 'fs';
import path from 'path';

helper.secrets.mockSuite(testing.suiteName(), [], function (mock, skipping) {
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

  const capturePulseMessages = () => {
    let messages = [];
    helper.onPulsePublish((exchange, routingKey, data) => {
      messages.push({
        exchange,
        routingKey,
        data: JSON.parse(Buffer.from(data).toString()),
      });
    });
    return messages;
  };

  const genAwsLaunchConfig = (workerManager = {}, region = 'us-west-2') => ({
    workerManager,
    region,
    launchConfig: {
      ImageId: 'ami-12345678',
    },
    capacityPerInstance: 1,
  });

  test('ping', async function () {
    await helper.workerManager.ping();
  });

  test('list providers', async function () {
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

  test('list providers pagination', async function () {
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

  test('create worker pool', async function () {
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

  test('schema validation - queueInactivityTimeout', async function () {
    const input = {
      providerId: 'aws',
      description: 'bar',
      owner: 'example@example.com',
      emailOnError: false,
      config: {
        launchConfigs: [],
        minCapacity: 1,
        maxCapacity: 1,
        scalingRatio: 1,
        lifecycle: {
          registrationTimeout: 6000,
          queueInactivityTimeout: 2,
        },
      },
    };
    const apiClient = helper.workerManager.use({ retries: 0 });
    await assert.rejects(
      () => apiClient.createWorkerPool(workerPoolId, input),
      err => (
        err.statusCode === 400 &&
        err.message.includes('queueInactivityTimeout must be >= 1200')
      ));
  });

  test('create worker pool - launchConfigIds are added/preserved', async function () {
    const input = {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs: [genAwsLaunchConfig()],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    };
    let messages = capturePulseMessages();
    const created = await helper.workerManager.createWorkerPool(workerPoolId, input);
    assert(created.config.launchConfigs[0].workerManager.launchConfigId);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].exchange, 'exchange/taskcluster-worker-manager/v1/worker-pool-created');
    assert.equal(messages[1].exchange, 'exchange/taskcluster-worker-manager/v1/launch-config-created');
    assert.equal(messages[1].data.launchConfigId, created.config.launchConfigs[0].workerManager.launchConfigId);
    delete created.config.launchConfigs[0].workerManager.launchConfigId;

    workerPoolCompare(workerPoolId, input, created);
  });

  test('create worker pool fails when pulse publish fails', async function () {
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

  test('update worker pool', async function () {
    let messages = capturePulseMessages();
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    const initial = await helper.workerManager.createWorkerPool(workerPoolId, input);
    workerPoolCompare(workerPoolId, input, initial);
    assert.equal(messages.length, 1);
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

    assert.equal(messages.length, 2);
    assert.equal(messages[0].exchange, 'exchange/taskcluster-worker-manager/v1/worker-pool-created');
    assert.equal(messages[1].exchange, 'exchange/taskcluster-worker-manager/v1/worker-pool-updated');
  });

  test('update worker pool - launch config events emitted', async function () {
    let messages = capturePulseMessages();
    const input = {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs: [
          genAwsLaunchConfig({ launchConfigId: 'lc1' }),
          genAwsLaunchConfig({ launchConfigId: 'lc2' }),
        ],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);
    assert.equal(messages.length, 3);
    assert.equal(messages[0].exchange, 'exchange/taskcluster-worker-manager/v1/worker-pool-created');
    assert.equal(messages[1].exchange, 'exchange/taskcluster-worker-manager/v1/launch-config-created');
    assert.equal(messages[1].data.launchConfigId, 'lc1');
    assert.equal(messages[2].exchange, 'exchange/taskcluster-worker-manager/v1/launch-config-created');
    assert.equal(messages[2].data.launchConfigId, 'lc2');

    const input2 = {
      ...input,
      config: {
        launchConfigs: [
          genAwsLaunchConfig({ launchConfigId: 'lc1' }),
          genAwsLaunchConfig({ launchConfigId: 'lc3' }),
        ],
        minCapacity: 1,
        maxCapacity: 1,
      },
    };
    messages.length = 0; // reset messages
    const updated = await helper.workerManager.updateWorkerPool(workerPoolId, input2);
    // updated launch config should have lc1, lc3 configs only
    assert.equal(updated.config.launchConfigs.length, 2);
    assert.equal(updated.config.launchConfigs[0].workerManager.launchConfigId, 'lc1');
    assert.equal(updated.config.launchConfigs[1].workerManager.launchConfigId, 'lc3');

    // events should have been emitted for archival of lc2, creation of lc3 and update of lc1
    assert.equal(messages.length, 4);
    assert.deepEqual(
      messages.filter(({ exchange }) => exchange === 'exchange/taskcluster-worker-manager/v1/launch-config-archived')
        .map(({ data }) => data.launchConfigId),
      ['lc2']);
    assert.deepEqual(
      messages.filter(({ exchange }) => exchange === 'exchange/taskcluster-worker-manager/v1/launch-config-created')
        .map(({ data }) => data.launchConfigId),
      ['lc3']);
    assert.deepEqual(
      messages.filter(({ exchange }) => exchange === 'exchange/taskcluster-worker-manager/v1/launch-config-updated')
        .map(({ data }) => data.launchConfigId),
      ['lc1']);

    const input3 = {
      ...input,
      config: {
        launchConfigs: [],
        minCapacity: 1,
        maxCapacity: 1,
      },
    };
    messages.length = 0;
    await helper.workerManager.updateWorkerPool(workerPoolId, input3);
    // all launch configs should have been archived
    assert.deepEqual(
      messages.filter(({ exchange }) => exchange === 'exchange/taskcluster-worker-manager/v1/launch-config-archived')
        .map(({ data }) => data.launchConfigId),
      ['lc1', 'lc3']);
  });

  test('update worker pool - launchConfigs are always updated with full config', async function () {
    const wpId = 'up/date';
    const input = {
      providerId: 'aws',
      description: 'upd',
      config: {
        launchConfigs: [
          genAwsLaunchConfig({ maxCapacity: 5 }, 'us-west-1'),
          genAwsLaunchConfig({ capacityPerInstance: 3 }, 'us-west-2'),
        ],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    };
    const created = await helper.workerManager.createWorkerPool(wpId, input);

    const modifiedInput = { ...input };
    modifiedInput.config.launchConfigs[0].workerManager.maxCapacity = 9;
    modifiedInput.config.launchConfigs[1].workerManager.capacityPerInstance = 8;

    const updated = await helper.workerManager.updateWorkerPool(wpId, modifiedInput);

    assert.notDeepEqual(updated.config.launchConfigs, created.config.launchConfigs);

    assert.equal(created.config.launchConfigs[0].workerManager.maxCapacity, 5);
    assert.equal(updated.config.launchConfigs[0].workerManager.maxCapacity, 9);

    assert.equal(created.config.launchConfigs[1].workerManager.capacityPerInstance, 3);
    assert.equal(updated.config.launchConfigs[1].workerManager.capacityPerInstance, 8);
  });

  test('launchConfigIds should be unique across worker pool - create worker pool', async function () {
    const input = {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs: [
          genAwsLaunchConfig({ launchConfigId: 'lc1' }, 'us-west-1'),
          genAwsLaunchConfig({ launchConfigId: 'lc1' }, 'us-west-2'),
        ],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    };

    await assert.rejects(
      async () => {
        await helper.workerManager.createWorkerPool('non/unique', input);
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.body.code, 'RequestConflict');
        assert.match(err.body.message, /Launch config with ID `lc1` already exists/);
        return true;
      },
    );
    // no worker pool record should be created since launch configs are not unique
    await assert.rejects(
      async () => helper.workerManager.workerPool('non/unique'),
      /ResourceNotFound/,
    );
  });

  test('launchConfigIds should be unique across worker pool - update worker pool', async function () {
    const input = {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs: [
          genAwsLaunchConfig({ launchConfigId: 'lc1' }, 'us-west-1'),
        ],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    };

    await helper.workerManager.createWorkerPool('non/unique', input);

    // changing config but not the id should result in a conflict
    input.config.launchConfigs[0].region = 'us-west-2';

    await assert.rejects(
      async () => {
        await helper.workerManager.updateWorkerPool('non/unique', input);
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.body.code, 'RequestConflict');
        assert.match(err.body.message, /Launch config with ID `lc1` already exists/);
        return true;
      },
    );

    // existing worker pool should not be modified
    const wp = await helper.workerManager.workerPool('non/unique');
    assert.equal(wp.config.launchConfigs.length, 1);
    assert.equal(wp.config.launchConfigs[0].region, 'us-west-1');
    assert.equal(wp.config.launchConfigs[0].workerManager.launchConfigId, 'lc1');
  });

  test('launchConfigIds can be non unique across different worker pools', async function () {
    await helper.workerManager.createWorkerPool('wp/p1', {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs: [genAwsLaunchConfig({ launchConfigId: 'lc1' })],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    });
    await helper.workerManager.createWorkerPool('wp/p2', {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs: [genAwsLaunchConfig({ launchConfigId: 'lc1' })],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    });
    const { workerPools: pools } = await helper.workerManager.listWorkerPools();
    assert.equal(pools.length, 2);
    assert.equal(pools[0].config.launchConfigs[0].workerManager.launchConfigId, 'lc1');
    assert.equal(pools[1].config.launchConfigs[0].workerManager.launchConfigId, 'lc1');
  });

  test('update worker pool fails when pulse publish fails', async function () {
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

  test('create worker pool (invalid providerId)', async function () {
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

  test('update worker pool (invalid workerPoolId)', async function () {
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

  test('update worker pool (invalid providerId)', async function () {
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

  test('update worker pool to providerId = null-provider', async function () {
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

  test('delete worker pool', async function () {
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

  test('delete worker pool - archives launch configs', async function () {
    await helper.workerManager.createWorkerPool(workerPoolId, {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs: [
          genAwsLaunchConfig({ launchConfigId: 'lc1' }),
          genAwsLaunchConfig({ launchConfigId: 'lc2' }),
        ],
        minCapacity: 1,
        maxCapacity: 1,
      },
      owner: 'example@example.com',
      emailOnError: false,
    });
    let messages = capturePulseMessages();
    await helper.workerManager.deleteWorkerPool(workerPoolId);
    assert.equal(messages.length, 3);
    assert.equal(messages[0].exchange, 'exchange/taskcluster-worker-manager/v1/worker-pool-updated');
    assert.equal(messages[1].exchange, 'exchange/taskcluster-worker-manager/v1/launch-config-archived');
    assert.equal(messages[2].exchange, 'exchange/taskcluster-worker-manager/v1/launch-config-archived');
    assert.equal(messages[1].data.launchConfigId, 'lc1');
    assert.equal(messages[2].data.launchConfigId, 'lc2');
  });

  test('create worker pool (already exists)', async function () {
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

  test('update worker pool (does not exist)', async function () {
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

  test('create worker pool (invalid config)', async function () {
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

  test('update worker pool (invalid config)', async function () {
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

  test('get worker pool', async function () {
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

  test('get worker pool (does not exist)', async function () {
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

  test('get worker pools - one worker pool', async function () {
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);
    let data = await helper.workerManager.listWorkerPools();

    data.workerPools.forEach(wp => {
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

  test('get worker pools - >1 worker pools', async function () {
    const input = await makeWorkerPools();
    const data = await helper.workerManager.listWorkerPools();
    assert(!data.continuationToken);
    data.workerPools.forEach((wp, i) => {
      workerPoolCompare(input[i].workerPoolId, input[i], wp);
    });
  });

  test('get worker pools, paginated', async function () {
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

  test('get worker pools - no worker pools in db', async function () {
    let data = await helper.workerManager.listWorkerPools();

    assert.deepStrictEqual(data.workerPools, [], 'Should return an empty array of worker pools');
  });

  test('get 404 status when worker pool is not present', async function () {
    const workerPoolId = 'no/such';
    await assert.rejects(() => helper.workerManager.listWorkersForWorkerPool(workerPoolId),
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
        created: taskcluster.fromNow('-1 seconds'),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: Worker.states.RUNNING,
        capacity: 1,
        providerData: {},
        secret: null,
        launchConfigId: 'lc-w1',
      },
      {
        workerPoolId,
        providerId: 'google',
        workerGroup: 'rust-workers',
        workerId: 's-555',
        created: taskcluster.fromNow('-2 seconds'),
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

    await createWorker(input[0]);
    await createWorker(input[1]);

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

  test('get workers for a given worker pool with filters', async function () {
    let input = [
      {
        workerPoolId,
        providerId: 'google',
        workerGroup: 'rust-workers',
        workerId: 's-3434',
        created: taskcluster.fromNow('-1 seconds'),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: Worker.states.RUNNING,
        capacity: 1,
        providerData: {},
        secret: null,
        launchConfigId: 'lc-w1',
      },
      {
        workerPoolId,
        providerId: 'google',
        workerGroup: 'rust-workers',
        workerId: 's-555',
        created: taskcluster.fromNow('-2 seconds'),
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

    await createWorker(input[0]);
    await createWorker(input[1]);

    let byState = await helper.workerManager.listWorkersForWorkerPool(workerPoolId, { state: Worker.states.STOPPED });
    assert.equal(byState.workers.length, 1);
    assert.equal(byState.workers[0].workerId, input[1].workerId);

    let byLc = await helper.workerManager.listWorkersForWorkerPool(workerPoolId, { launchConfigId: 'lc-w1' });
    assert.equal(byLc.workers.length, 1);
    assert.equal(byLc.workers[0].workerId, input[0].workerId);
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

    await createWorker(input[0]);
    await createWorker(input[1]);

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
      launchConfigId: 'lc-w1',
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

  test('worker pools stats', async function () {
    const workerPoolId = 'wp/stats';
    await createWorker({
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
      launchConfigId: 'lc-w1',
    });

    await helper.workerManager.createWorkerPool(workerPoolId, {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    });
    let data = await helper.workerManager.listWorkerPoolsStats();

    assert.equal(data.workerPoolsStats.length, 1);
    assert.equal(data.workerPoolsStats[0].workerPoolId, workerPoolId);
    assert.equal(data.workerPoolsStats[0].runningCount, 1);
    assert.equal(data.workerPoolsStats[0].runningCapacity, 1);
  });

  suite('worker creation / update / removal', function () {
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

    test('create a worker with existing workerId', async function () {
      await createWorkerPool({
        providerId: 'static',
      });

      let staticSecret = `${taskcluster.slugid()}${taskcluster.slugid()}`;
      const expires = taskcluster.fromNow('1 hour');
      await helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
        expires,
        providerInfo: { staticSecret },
      });
      await helper.workerManager.removeWorker(workerPoolId, workerGroup, workerId);

      await assert.rejects(async () => helper.workerManager.createWorker(workerPoolId, workerGroup, workerId, {
        expires: taskcluster.fromNow('1 hour'),
        providerInfo: { staticSecret },
      }), err => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'RequestConflict');
        assert.match(err.body.message, /Worker already exists/);
        return true;
      });
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

  test('Report a worker error', async function () {
    const workerPoolId = 'foobar/baz';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);

    let messages = [];
    helper.onPulsePublish((exchange, routingKey, data) => {
      messages.push({
        exchange,
        routingKey,
        data: JSON.parse(Buffer.from(data).toString()),
      });
    });

    const beforeTime = new Date();
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

    assert.equal(messages.length, 1);
    assert.equal(messages[0].exchange, 'exchange/taskcluster-worker-manager/v1/worker-pool-error');
    assert.equal(messages[0].routingKey, 'primary.testing1.foobar.baz.wg.wi._._');
    let { errorId, ...msgData } = messages[0].data;
    assert(new Date(msgData.timestamp) > beforeTime.getTime() - 1);

    msgData.timestamp = 'xx';
    assert.deepEqual(msgData, {
      workerPoolId,
      providerId: 'testing1',
      kind: 'worker-error',
      title: 'Something is Wrong',
      workerId: 'wi',
      workerGroup: 'wg',
      timestamp: 'xx',
    });

    messages = [];

    // test with the launchConfigId
    const worker2 = await createWorker({
      workerPoolId,
      workerId: 'wi2',
      launchConfigId: 'lc-id-1',
    });
    await helper.workerManager.reportWorkerError(workerPoolId, {
      workerGroup: worker2.workerGroup,
      workerId: worker2.workerId,
      kind: "worker-error",
      title: 'Something is definitely Wrong',
      description: 'Doh!',
      extra: { notes: 'launchConfigId should be here' },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].exchange, 'exchange/taskcluster-worker-manager/v1/worker-pool-error');
    assert.equal(messages[0].routingKey, 'primary.testing1.foobar.baz.wg.wi2.lc-id-1._');
    assert.equal(messages[0].data.launchConfigId, 'lc-id-1');
  });

  test('Report a worker error, no such pool', async function () {
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

  test('get worker pool errors - no errors in db', async function () {
    let data = await helper.workerManager.listWorkerPoolErrors('foobar/baz');

    assert.deepStrictEqual(data.workerPoolErrors, [], 'Should return an empty array of worker pool errors');
  });

  test('get worker pool errors - single', async function () {
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

  test('get worker pool errors - query filters', async function () {
    const workerPoolId = 'foobar/baz';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    await helper.workerManager.createWorkerPool(workerPoolId, input);

    const res1 = await helper.workerManager.reportWorkerError(workerPoolId, {
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

    await createWorker({ launchConfigId: 'lcid', workerPoolId, workerGroup: 'wg', workerId: 'wid' });
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

    let byId = await helper.workerManager.listWorkerPoolErrors('foobar/baz', { errorId: res1.errorId });
    assert.ok(byId.workerPoolErrors);
    assert.equal(byId.workerPoolErrors.length, 1);

    let byLc = await helper.workerManager.listWorkerPoolErrors('foobar/baz', { launchConfigId: 'lcid' });
    assert.ok(byLc.workerPoolErrors);
    assert.equal(byLc.workerPoolErrors.length, 1);

  });

  test('get worker pool errors - multiple', async function () {
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

  test('get worker pool error stats - all worker pools', async function () {
    const workerPoolId1 = 'foobar/baz1';
    const workerPoolId2 = 'foobar/baz2';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId1, input,
      await helper.workerManager.createWorkerPool(workerPoolId1, input));
    workerPoolCompare(workerPoolId2, input,
      await helper.workerManager.createWorkerPool(workerPoolId2, input));

    await helper.workerManager.reportWorkerError(workerPoolId1, {
      kind: 'something-error',
      workerGroup: 'wg',
      workerId: 'wid',
      title: 'And Error about Something',
      description: 'WHO KNOWS',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
      extra: {
        foo: 'bar-123-456',
        code: 'error-code',
      },
    });

    await helper.workerManager.reportWorkerError(workerPoolId2, {
      kind: 'another-error',
      workerGroup: 'wg',
      workerId: 'wid',
      title: 'And Error about another something',
      description: 'huh',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
      extra: {},
    });

    let data = await helper.workerManager.workerPoolErrorStats();
    assert.equal(data.workerPoolId, '');

    assert(data.totals !== undefined);
    assert.equal(data.totals.total, 2);
    assert.deepEqual(Object.values(data.totals.daily), [0, 0, 0, 0, 0, 0, 2]);
    assert.deepEqual(Object.values(data.totals.hourly), [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 2,
    ]);
    assert.deepEqual(data.totals.title, {
      'And Error about Something': 1,
      'And Error about another something': 1,
    });
    assert.deepEqual(data.totals.code, {
      'error-code': 1,
      'other': 1,
    });
    assert.deepEqual(data.totals.workerPool, {
      [workerPoolId1]: 1,
      [workerPoolId2]: 1,
    });
  });

  test('get worker pool error stats - single worker pools', async function () {
    const workerPoolId1 = 'foobar/baz1';
    const workerPoolId2 = 'foobar/baz2';
    const input = {
      providerId: 'testing1',
      description: 'bar',
      config: {},
      owner: 'example@example.com',
      emailOnError: false,
    };
    workerPoolCompare(workerPoolId1, input,
      await helper.workerManager.createWorkerPool(workerPoolId1, input));
    workerPoolCompare(workerPoolId2, input,
      await helper.workerManager.createWorkerPool(workerPoolId2, input));

    await helper.workerManager.reportWorkerError(workerPoolId1, {
      kind: 'something-error',
      workerGroup: 'wg',
      workerId: 'wid',
      title: 'And Error about Something',
      description: 'WHO KNOWS',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
      extra: {
        foo: 'bar-123-456',
        code: 'error-code',
      },
    });

    await helper.workerManager.reportWorkerError(workerPoolId2, {
      kind: 'another-error',
      workerGroup: 'wg',
      workerId: 'wid',
      title: 'And Error about another something',
      description: 'huh',
      notify: helper.notify,
      WorkerPoolError: helper.WorkerPoolError,
      extra: {},
    });

    let data = await helper.workerManager.workerPoolErrorStats({ workerPoolId: workerPoolId1 });
    assert.equal(data.workerPoolId, workerPoolId1);

    assert(data.totals !== undefined);
    assert.equal(data.totals.total, 1);
    assert.deepEqual(Object.values(data.totals.daily), [0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual(Object.values(data.totals.hourly), [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 1,
    ]);
    assert.deepEqual(data.totals.title, {
      'And Error about Something': 1,
    });
    assert.deepEqual(data.totals.code, {
      'error-code': 1,
    });
    assert.deepEqual(data.totals.workerPool, {
      [workerPoolId1]: 1,
    });
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
          workerManager: {
            capacityPerInstance: 1,
            launchConfigId: 'lc-goog-1',
          },
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

  test('create (google) worker pool', async function () {
    workerPoolCompare(workerPoolId, googleInput,
      await helper.workerManager.createWorkerPool(workerPoolId, googleInput));
  });

  suite('registerWorker', function () {
    const providerId = 'testing1';
    const workerGroup = 'wg';
    const workerId = 'wi';
    const workerIdentityProof = { 'token': 'tok' };

    suiteSetup(function () {
      helper.load.save();

      // create fake clientId / accessToken for temporary creds
      helper.load.cfg('taskcluster.credentials.clientId', 'fake');
      helper.load.cfg('taskcluster.credentials.accessToken', 'fake');
    });

    suiteTeardown(function () {
      helper.load.restore();
    });

    const defaultRegisterWorker = {
      workerPoolId, providerId, workerGroup, workerId, workerIdentityProof,
    };

    test('no such workerPool', async function () {
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        workerPoolId: 'no/such',
      }), /Worker pool no\/such does not exist/);
    });

    test('no such provider', async function () {
      const providerId = 'no-such';
      await createWorkerPool({
        providerId,
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        providerId,
      }), /Provider no-such does not exist/);
    });

    test('provider not associated', async function () {
      await createWorkerPool({
        providerId: 'testing2',
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
        providerId: 'testing1',
      }), /Worker pool pp\/ee not associated with provider testing1/);
    });

    test('no such worker', async function () {
      await createWorkerPool({
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /Worker wg\/wi in worker pool pp\/ee does not exist/);
    });

    test('worker requests across pools', async function () {
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

    test('worker does not have providerId', async function () {
      await createWorkerPool({});
      await createWorker({
        providerId: 'testing2',
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /Worker wg\/wi does not have provider testing1/);
    });

    test('error from prov.registerWorker', async function () {
      await createWorkerPool({});
      await createWorker({
        providerData: { failRegister: 'uhoh' },
      });
      await assert.rejects(() => helper.workerManager.registerWorker({
        ...defaultRegisterWorker,
      }), /uhoh/);
    });

    test('sweet success', async function () {
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

    test('registers with systemBootTime and records metrics', async function () {
      const monitor = await helper.load('monitor');

      // Install a fake prometheus recorder on the shared manager to capture
      // metric observations from any child monitor.
      const observed = [];
      const origPrometheus = monitor.manager._prometheus;
      monitor.manager._prometheus = {
        observe: (name, value, labels) => observed.push({ name, value, labels }),
        inc: () => {},
        set: () => {},
      };

      try {
        // worker.created must be before systemBootTime (VM requested, then booted)
        const workerCreated = new Date(Date.now() - 60000);
        const bootTime = new Date(Date.now() - 30000);

        await createWorkerPool({});
        await createWorker({
          created: workerCreated,
          providerData: {
            workerConfig: {
              "someKey": "someValue",
            },
          },
        });
        const res = await helper.workerManager.registerWorker({
          ...defaultRegisterWorker,
          systemBootTime: bootTime.toISOString(),
        });

        assert.equal(res.credentials.clientId,
          `worker/${providerId}/${workerPoolId}/${workerGroup}/${workerId}`);
        assert.equal(res.workerConfig.someKey, "someValue");

        const provisionMetric = observed.find(m => m.name === 'worker_manager_worker_provision_seconds');
        const startupMetric = observed.find(m => m.name === 'worker_manager_worker_startup_seconds');
        assert(provisionMetric, 'workerProvisionDuration metric should be recorded');
        assert(startupMetric, 'workerStartupDuration metric should be recorded');
        assert(provisionMetric.value >= 0, 'provision duration should be non-negative');
        assert(startupMetric.value >= 0, 'startup duration should be non-negative');
      } finally {
        monitor.manager._prometheus = origPrometheus;
      }
    });

    test('sweet success for a previous providerId', async function () {
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

    test('[Integration] Successful registering an AWS worker', async function () {
      const __dirname = new URL('.', import.meta.url).pathname;
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

  suite('reregisterWorker', function () {
    const providerId = 'testing1';
    const workerGroup = 'wg';
    const workerId = 'wi';
    const workerIdentityProof = { 'token': 'tok' };

    suiteSetup(function () {
      helper.load.save();

      // create fake clientId / accessToken for temporary creds
      helper.load.cfg('taskcluster.credentials.clientId', 'fake');
      helper.load.cfg('taskcluster.credentials.accessToken', 'fake');
    });

    suiteTeardown(function () {
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

    test('works without reregistrationTimeout', async function () {
      const config = {
        providerData: {
          workerConfig: {
            "someKey": "someValue",
          },
        },
      };
      await testExpires(config);
    });

    test('works with reregistrationTimeout', async function () {
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

    test('works with terminateAfter', async function () {
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

    test('throws when secret is bad', async function () {
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

    test('throws when worker does not exist', async function () {
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

    test('throws when secret is not defined', async function () {
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

  suite('ensure 403s when required', function () {
    test('listProviders without scopes', async function () {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listProviders(),
        err => err.code === 'InsufficientScopes');
    });
    test('workerPool without scopes', async function () {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.workerPool('aa/bb'),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkerPools without scopes', async function () {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkerPools(),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkerPoolErrors without scopes', async function () {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkerPoolErrors('aa/bb'),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkersForWorkerPool without scopes', async function () {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkersForWorkerPool('aa/bb'),
        err => err.code === 'InsufficientScopes');
    });
    test('listWorkersForWorkerGroup without scopes', async function () {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.listWorkersForWorkerGroup('aa/bb', 'ff'),
        err => err.code === 'InsufficientScopes');
    });
    test('worker without scopes', async function () {
      const client = new helper.WorkerManager({ rootUrl: helper.rootUrl });
      await assert.rejects(
        () => client.worker('aa/bb', 'ff', 'i-123'),
        err => err.code === 'InsufficientScopes');
    });
  });

  suite('worker metadata', function () {
    const makeQueueVisible = async (workerPoolId, workerGroup, workerId) => {
      // make it visible to the queue
      // we cannot directly call queue_worker_seen_with_last_date_active
      // because worker-manager client doesn't have write access to that tables
      await helper.withAdminDbClient(async (client) => {
        await client.query(`insert
          into queue_workers
          (task_queue_id, worker_group, worker_id, recent_tasks, quarantine_until, expires, first_claim, last_date_active) values
          ($1, $2, $3, jsonb_build_array(), now() - interval '1 hour', now() + interval '1 hour', now() - interval '1 hour', now())`,
        [workerPoolId, workerGroup, workerId]);
        await client.query(`insert
          into task_queues
          (task_queue_id, expires, last_date_active, stability, description) values
          ($1, now() + interval '1 hour', now() - interval '1 hour', $2, $3)`,
        [workerPoolId, 'experimental', 'description']);
      });
    };

    test('get worker/workers with queue metadata', async function () {
      await createWorkerPool({});
      await createWorker({});

      const [provisionerId, workerType] = workerPoolId.split('/');

      // worker is not yet visible to the queue so this method will fail
      await assert.rejects(() =>
        helper.workerManager.getWorker(provisionerId, workerType, workerGroup, workerId),
      new RegExp(`Worker with workerId.+not found`),
      );

      await makeQueueVisible(workerPoolId, workerGroup, workerId);

      const res = await helper.workerManager.getWorker(provisionerId, workerType, workerGroup, workerId);
      assert.equal(res.workerPoolId, workerPoolId);
      assert.deepEqual(res.quarantineDetails, []);
    });

    test('get workers with queue metadata', async function () {
      const wpId = 'tt/cc2';
      await createWorkerPool({ workerPoolId: wpId });
      await createWorker({
        workerId: 'w2',
        workerPoolId: wpId,
        launchConfigId: 'wp-lc-1',
      });

      await makeQueueVisible(wpId, workerGroup, 'w2');
      const [provisionerId, workerType] = wpId.split('/');

      const { workers } = await helper.workerManager.listWorkers(provisionerId, workerType);
      assert.equal(workers.length, 1);
      assert.equal(workers[0].workerPoolId, wpId);
      assert.equal(workers[0].workerId, 'w2');
      assert.equal(workers[0].launchConfigId, 'wp-lc-1');
    });
  });

  suite('worker metadata', function () {
    const makeQueueVisible = async (wp, wg, wid) => {
      // we cannot directly call queue_worker_seen_with_last_date_active
      // because worker-manager client doesn't have write access to that tables
      await helper.withAdminDbClient(async (client) => {
        await client.query(`insert
          into queue_workers
          (task_queue_id, worker_group, worker_id, recent_tasks, quarantine_until, expires, first_claim, last_date_active) values
          ($1, $2, $3, jsonb_build_array(), now() - interval '1 hour', now() + interval '1 hour', now() - interval '1 hour', now())`,
        [wp, wg, wid]);
        await client.query(`insert
          into task_queues
          (task_queue_id, expires, last_date_active, stability, description) values
          ($1, now() + interval '1 hour', now() - interval '1 hour', $2, $3)`,
        [wp, 'experimental', 'description']);
      });
    };

    test('get worker with queue metadata', async function () {
      const workerPoolId2 = 'pp/ee2';
      const workerGroup2 = 'wg2';
      const workerId2 = 'wi2';

      await createWorkerPool({ workerPoolId: workerPoolId2, workerGroup: workerGroup2 });
      await createWorker({ workerPoolId: workerPoolId2, workerGroup: workerGroup2, workerId: workerId2 });

      const [provisionerId, workerType] = workerPoolId2.split('/');

      // worker is not yet visible to the queue so this method will fail
      await assert.rejects(() =>
        helper.workerManager.getWorker(provisionerId, workerType, workerGroup2, workerId2),
      new RegExp(`Worker with workerId.+not found`),
      );

      await makeQueueVisible(workerPoolId2, workerGroup2, workerId2);

      const res = await helper.workerManager.getWorker(provisionerId, workerType, workerGroup2, workerId2);
      assert.equal(res.workerPoolId, workerPoolId2);
      assert.deepEqual(res.quarantineDetails, []);
    });

    test('get workers with queue metadata', async function () {
      const workerPoolId3 = 'pp/ee3';
      const workerGroup3 = 'wg3';
      const workerId3 = 'wi3';

      await createWorkerPool({ workerPoolId: workerPoolId3, workerGroup: workerGroup3 });
      await createWorker({ workerPoolId: workerPoolId3, workerGroup: workerGroup3, workerId: workerId3 });

      await makeQueueVisible(workerPoolId3, workerGroup3, workerId3);

      const [provisionerId, workerType] = workerPoolId3.split('/');

      const { workers } = await helper.workerManager.listWorkers(provisionerId, workerType);
      assert.equal(workers.length, 1);
      assert.equal(workers[0].workerPoolId, workerPoolId3);
      assert.equal(workers[0].workerId, workerId3);
    });

    test('get workers with queue metadata and filters', async function () {
      const workerPoolId4 = 'pp/ee4';
      const workerGroup4 = 'wg4';
      const workerId4 = 'wi4';
      const launchConfigId = 'lcId2';

      await createWorkerPool({ workerPoolId: workerPoolId4, workerGroup: workerGroup4 });
      await createWorker({
        workerPoolId: workerPoolId4,
        workerGroup: workerGroup4,
        workerId: workerId4,
        launchConfigId,
        state: Worker.states.REQUESTED,
      });

      await makeQueueVisible(workerPoolId4, workerGroup4, workerId4);

      const [provisionerId, workerType] = workerPoolId4.split('/');

      const filters = [
        { quarantined: 'false' },
        { workerState: Worker.states.REQUESTED },
        { launchConfigId: launchConfigId },
      ];

      for (const filter of filters) {
        const { workers } = await helper.workerManager.listWorkers(provisionerId, workerType, filter);
        assert.equal(workers.length, 1);
        assert.equal(workers[0].workerPoolId, workerPoolId4);
        assert.equal(workers[0].workerId, workerId4);
      }

      const noWorkersFilters = [
        { quarantined: 'true' },
        { workerState: Worker.states.STOPPING },
        { launchConfigId: 'NoSuchId1' },
      ];
      for (const filter of noWorkersFilters) {
        const { workers } = await helper.workerManager.listWorkers(provisionerId, workerType, filter);
        assert.equal(workers.length, 0);
      }
    });
  });
});
