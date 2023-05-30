const { ApiError } = require('../src/providers/provider');
const _ = require('lodash');
const assert = require('assert');
const helper = require('./helper');
const { AwsProvider } = require('../src/providers/aws');
const testing = require('taskcluster-lib-testing');
const fs = require('fs');
const path = require('path');
const taskcluster = require('taskcluster-client');
const { WorkerPool, Worker } = require('../src/data');
const { FakeEC2 } = require('./fakes');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.resetTables(mock, skipping);

  let provider;
  const providerId = 'aws';
  const workerPoolId = 'foo/bar';
  const defaultLaunchConfig = {
    region: 'us-west-2',
    capacityPerInstance: 1,
    launchConfig: {
      ImageId: 'banana-123',
    },
  };
  const defaultWorker = {
    workerPoolId,
    workerGroup: 'us-west-2',
    providerId,
    created: taskcluster.fromNow('0 seconds'),
    expires: taskcluster.fromNow('90 seconds'),
    lastModified: taskcluster.fromNow('0 seconds'),
    lastChecked: taskcluster.fromNow('0 seconds'),
    capacity: 1,
    state: 'requested',
    providerData: {},
  };
  const actualWorkerIid = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString());
  const workerInDB = {
    ...defaultWorker,
    workerId: actualWorkerIid.instanceId,
    providerData: {
      region: actualWorkerIid.region,
      imageId: actualWorkerIid.imageId,
      instanceType: actualWorkerIid.instanceType,
      instanceCapacity: defaultLaunchConfig.capacityPerInstance,
      architecture: actualWorkerIid.architecture,
      availabilityZone: actualWorkerIid.availabilityZone,
      privateIp: actualWorkerIid.privateIp,
      owner: actualWorkerIid.accountId,
    },
  };

  const fake = new FakeEC2();
  fake.forSuite();

  setup(async function() {
    provider = new AwsProvider({
      providerId,
      notify: await helper.load('notify'),
      db: helper.db,
      monitor: (await helper.load('monitor')).childMonitor('aws'),
      estimator: await helper.load('estimator'),
      rootUrl: helper.rootUrl,
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {
        providerType: 'aws',
        credentials: {
          accessKeyId: 'accesskeyid',
          secretAccessKey: 'topsecret',
        },
      },
      queue: helper.queue,
    });

    await helper.db.fns.delete_worker_pool(workerPoolId);

    await provider.setup();
  });

  const makeWorkerPool = async (overrides = {}) => {
    let workerPool = WorkerPool.fromApi({
      workerPoolId,
      providerId,
      description: 'none',
      previousProviderIds: [],
      created: new Date(),
      lastModified: new Date(),
      config: {
        launchConfigs: [
          defaultLaunchConfig,
        ],
        minCapacity: 1,
        maxCapacity: 1,
        scalingRatio: 1,
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
      ...overrides,
    });
    await workerPool.create(helper.db);

    return workerPool;
  };

  const assertHasTag = (runInstanceCall, ResourceType, Key, Value) => {
    const tagspecs = runInstanceCall.TagSpecifications;
    const tagspec = _.find(tagspecs, { ResourceType });
    assert(tagspec, `no tags for resource type ${ResourceType} in ${JSON.stringify(tagspecs)}`);
    const tag = _.find(tagspec.Tags, { Key });
    assert(tag, `no tag for key ${Key}, resource type ${ResourceType} in ${JSON.stringify(tagspecs)}`);
    assert.equal(tag.Value, Value);
  };

  suite('AWS provider - provision', function() {
    const provisionTest = (name, { config, expectedWorkers }, check) => {
      test(name, async function() {
        const workerPool = await makeWorkerPool({ config });
        const workerInfo = { existingCapacity: 0, requestedCapacity: 0 };
        await provider.provision({ workerPool, workerInfo });
        const workers = await helper.getWorkers();
        assert.equal(workers.length, expectedWorkers);
        await check(workers);
      });
    };

    provisionTest('simple launchConfig, single worker', {
      config: {
        launchConfigs: [defaultLaunchConfig],
        minCapacity: 1,
        maxCapacity: 1,
        scalingRatio: 1,
        lifecycle: {
          registrationTimeout: 6000,
        },
      },
      expectedWorkers: 1,
    }, async function(workers) {
      const now = Date.now();
      workers.forEach(w => {
        assert.strictEqual(w.workerPoolId, workerPoolId, 'Worker was created for a wrong worker pool');
        assert.strictEqual(w.workerGroup, 'us-west-2', 'Worker group should be az');
        assert.strictEqual(w.state, Worker.states.REQUESTED, 'Worker should be marked as requested');
        assert.strictEqual(w.providerData.region, defaultLaunchConfig.region, 'Region should come from the chosen config');
        // Check that this is setting times correctly to within a second or so to allow for some time
        // for the provisioning loop
        assert(workers[0].providerData.terminateAfter - now - (6000 * 1000) < 5000);
      });
      assert.deepEqual(fake.rgn('us-west-2').runInstancesCalls.map(({ MinCount }) => MinCount), [1]);
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'CreatedBy', 'taskcluster-wm-aws');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'Owner', 'whatever@example.com');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'ManagedBy', 'taskcluster');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'Name', 'foo/bar');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'WorkerPoolId', 'foo/bar');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'CreatedBy', 'taskcluster-wm-aws');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'Owner', 'whatever@example.com');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'ManagedBy', 'taskcluster');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'Name', 'foo/bar');
      assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'WorkerPoolId', 'foo/bar');
    });

    provisionTest('spawns instances from across launch configs', {
      config: {
        launchConfigs: [
          { ...defaultLaunchConfig, capacityPerInstance: 6 },
          { ...defaultLaunchConfig, capacityPerInstance: 6 },
          { ...defaultLaunchConfig, capacityPerInstance: 6 },
          { ...defaultLaunchConfig, capacityPerInstance: 6 },
          { ...defaultLaunchConfig, capacityPerInstance: 6 },
        ],
        minCapacity: 34, // not a multiple of number of configs or capPerInstance
        maxCapacity: 34,
        scalingRatio: 1,
      },
      // capacity 34 at 6 per instance should be 6 instances..
      expectedWorkers: 6,
    }, async function(workers) {
      // spawn two each in three launchConfigs; spawning one each would only get us 5 instances since there
      // are only 5 launchConfigs
      assert.deepEqual(fake.rgn('us-west-2').runInstancesCalls.map(({ MinCount }) => MinCount), [2, 2, 2]);
    });

    for (let ResourceType of ['instance', 'volume', 'launch-template']) {
      provisionTest(`${ResourceType} tags in launch spec - should merge them`, {
        config: {
          launchConfigs: [
            {
              ...defaultLaunchConfig,
              launchConfig: {
                ...defaultLaunchConfig.launchConfig,
                TagSpecifications: [
                  { ResourceType, Tags: [{ Key: 'mytag', Value: 'testy' }] },
                ],
              },
            },
          ],
          minCapacity: 1,
          maxCapacity: 1,
          scalingRatio: 1,
        },
        expectedWorkers: 1,
      }, async function(workers) {
        assert.equal(fake.rgn('us-west-2').runInstancesCalls.length, 1);
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], ResourceType, 'mytag', 'testy');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'CreatedBy', 'taskcluster-wm-aws');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'Owner', 'whatever@example.com');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'ManagedBy', 'taskcluster');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'Name', 'foo/bar');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'instance', 'WorkerPoolId', 'foo/bar');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'CreatedBy', 'taskcluster-wm-aws');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'Owner', 'whatever@example.com');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'ManagedBy', 'taskcluster');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'Name', 'foo/bar');
        assertHasTag(fake.rgn('us-west-2').runInstancesCalls[0], 'volume', 'WorkerPoolId', 'foo/bar');
      });
    }

    provisionTest('UserData contains additionalUserData, workerConfig, etc.', {
      config: {
        launchConfigs: [
          {
            ...defaultLaunchConfig,
            workerConfig: { foo: 5 },
            additionalUserData: {
              somethingImportant: "apple",
            },
          },
        ],
        minCapacity: 1,
        maxCapacity: 1,
        scalingRatio: 1,
      },
      expectedWorkers: 1,
    }, async function(workers) {
      const decoded = JSON.parse(Buffer.from(
        fake.rgn('us-west-2').runInstancesCalls[0].UserData,
        'base64',
      ).toString());
      assert.deepStrictEqual(decoded, {
        somethingImportant: 'apple',
        rootUrl: provider.rootUrl,
        workerPoolId: workerPoolId,
        providerId: provider.providerId,
        workerGroup: 'us-west-2',
        workerConfig: { foo: 5 },
      });
    });
  });

  suite('[UNIT] AWS provider - registerWorker', function() {

    test('registerWorker - verifyInstanceIdentityDocument - document is not string', async function() {
      const workerPool = await makeWorkerPool();
      const workerIdentityProof = {
        "document": { 'instanceId': 'abc' },
        "signature": 'abcd',
      };

      await assert.rejects(
        () => provider.registerWorker({ worker: workerInDB, workerPool, workerIdentityProof }),
        new ApiError('Request must include both a document (string) and a signature'),
      );
    });

    test('registerWorker - verifyInstanceIdentityDocument - bad document', async function() {
      const workerPool = await makeWorkerPool();
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT_bad')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      await assert.rejects(
        () => provider.registerWorker({ worker: workerInDB, workerPool, workerIdentityProof }),
        new ApiError('Instance identity document validation error'),
        'Should fail to verify iid (the document has been edited)',
      );
    });

    test('registerWorker - verifyInstanceIdentityDocument - signature was produced with a wrong key', async function() {
      const workerPool = await makeWorkerPool();
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE_badKey')).toString(),
      };

      await assert.rejects(() => provider.registerWorker({ worker: workerInDB, workerPool, workerIdentityProof }),
        new ApiError('Instance identity document validation error'),
        'Should fail to verify iid (the signature was produced with a wrong key)',
      );
    });

    test('registerWorker - verifyInstanceIdentityDocument - signature is wrong', async function() {
      const workerPool = await makeWorkerPool();
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE_badSignature')).toString(),
      };

      await assert.rejects(() => provider.registerWorker({ worker: workerInDB, workerPool, workerIdentityProof }),
        new ApiError('Instance identity document validation error'),
        'Should fail to verify iid (the signature is wrong)',
      );
    });

    test('registerWorker - verifyWorkerInstance - document is legit but differs from what we know about the instance', async function() {
      const workerPool = await makeWorkerPool();
      const differentWorkerInDB = {
        ...defaultWorker,
        workerId: actualWorkerIid.instanceId,
        providerData: {
          region: 'eu-central-2',
          imageId: actualWorkerIid.imageId,
          instanceType: actualWorkerIid.instanceType,
          architecture: actualWorkerIid.architecture,
          availabilityZone: 'eu-central-2a',
          privateIp: '4.45.67.2',
          owner: actualWorkerIid.accountId,
        },
      };

      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      await assert.rejects(
        () => provider.registerWorker({ worker: differentWorkerInDB, workerPool, workerIdentityProof }),
        new ApiError('Instance validation error'),
        'Should fail to verify worker (info from the signature and info from our DB differ)',
      );
    });

    test('registerWorker - no signature', async function() {
      const workerPool = await makeWorkerPool();
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_EMPTYFILE')).toString(),
      };

      await assert.rejects(() => provider.registerWorker({ worker: workerInDB, workerPool, workerIdentityProof }),
        new ApiError('Request must include both a document (string) and a signature'),
      );
    });

    test('registerWorker - worker is already running', async function() {
      const workerPool = await makeWorkerPool();
      const runningWorker = {
        ...workerInDB,
        state: 'running',
      };

      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      await assert.rejects(
        () => provider.registerWorker({ worker: runningWorker, workerPool, workerIdentityProof }),
        new ApiError('This worker is either stopped or running. No need to register'),
        'Should fail because the worker is already running',
      );
    });

    test('registerWorker - success', async function() {
      const workerPool = await makeWorkerPool();
      const runningWorker = await Worker.fromApi({
        workerId: 'i-02312cd4f06c990ca',
        ...defaultWorker,
        providerData: {
          region: 'us-west-2',
          imageId: actualWorkerIid.imageId,
          instanceType: actualWorkerIid.instanceType,
          architecture: actualWorkerIid.architecture,
          availabilityZone: 'us-west-2a',
          privateIp: '172.31.23.159',
          owner: actualWorkerIid.accountId,
          workerConfig: {
            "someConfig": "someConfigValue",
          },
        },
      });
      await runningWorker.create(helper.db);

      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      const resp = await provider.registerWorker({ worker: runningWorker, workerPool, workerIdentityProof });
      assert(resp.expires - new Date() + 10000 > 96 * 3600 * 1000);
      assert(resp.expires - new Date() - 10000 < 96 * 3600 * 1000);
      assert.equal(resp.workerConfig.someConfig, 'someConfigValue');
    });

    test('registerWorker - success (different reregister)', async function() {
      const workerPool = await makeWorkerPool();
      const runningWorker = await Worker.fromApi({
        workerId: 'i-02312cd4f06c990ca',
        ...defaultWorker,
        providerData: {
          region: 'us-west-2',
          imageId: actualWorkerIid.imageId,
          reregistrationTimeout: 10 * 3600 * 1000,
          instanceType: actualWorkerIid.instanceType,
          architecture: actualWorkerIid.architecture,
          availabilityZone: 'us-west-2a',
          privateIp: '172.31.23.159',
          owner: actualWorkerIid.accountId,
          workerConfig: {
            'someKey': 'someValue',
          },
        },
      });
      await runningWorker.create(helper.db);

      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      const resp = await provider.registerWorker({ worker: runningWorker, workerPool, workerIdentityProof });
      assert(resp.expires - new Date() + 10000 > 10 * 3600 * 1000);
      assert(resp.expires - new Date() - 10000 < 10 * 3600 * 1000);
      assert.equal(resp.workerConfig.someKey, 'someValue');
    });
  });

  suite('AWS provider - checkWorker', function() {

    test('stopped instances - should be marked as STOPPED in DB, should not add to seen', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'stopped';
      const worker = await Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.RUNNING,
      });
      await worker.create(helper.db);

      provider.seen = {};
      await provider.checkWorker({ worker });

      const workers = await helper.getWorkers();
      assert.notStrictEqual(workers.length, 0);
      workers.forEach(w =>
        assert.strictEqual(w.state, Worker.states.STOPPED));
      assert.strictEqual(provider.seen[worker.workerPoolId], 0);
    });

    test('pending/running,/shutting-down/stopping instances - should not reject', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'running';
      const worker = await Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.REQUESTED,
      });
      await worker.create(helper.db);

      provider.seen = {};
      await provider.checkWorker({ worker });

      const workers = await helper.getWorkers();
      assert.notStrictEqual(workers.length, 0);
      workers.forEach(w =>
        assert.strictEqual(w.state, Worker.states.REQUESTED));
      assert.strictEqual(provider.seen[worker.workerPoolId], 1);
    });

    test('some strange status - should reject', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'banana';
      const worker = Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.REQUESTED,
      });
      await worker.create(helper.db);

      provider.seen = {};
      await assert.rejects(provider.checkWorker({ worker }));
      assert.strictEqual(provider.seen[worker.workerPoolId], 0);
    });

    test('instance terminated by hand - should be marked as STOPPED in DB; should not reject', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'terminated';
      const worker = Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.RUNNING,
      });
      await worker.create(helper.db);

      provider.seen = {};
      await provider.checkWorker({ worker });

      const workers = await helper.getWorkers();
      assert.notStrictEqual(workers.length, 0);
      workers.forEach(w =>
        assert.strictEqual(w.state, Worker.states.STOPPED));
      assert.strictEqual(provider.seen[worker.workerPoolId], 0);
    });

    test('remove unregistered workers', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'running';
      const worker = Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.REQUESTED,
        providerData: {
          ...workerInDB.providerData,
          terminateAfter: Date.now() - 1000,
        },
      });
      await worker.create(helper.db);
      provider.seen = {};
      await provider.checkWorker({ worker });
      assert.deepEqual(fake.rgn('us-west-2').terminatedInstances, ['i-123']);
    });

    test('don\'t remove unregistered workers that are new', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'running';
      const worker = Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.REQUESTED,
        providerData: {
          ...workerInDB.providerData,
          terminateAfter: Date.now() + 1000,
        },
      });
      await worker.create(helper.db);
      provider.seen = {};
      await provider.checkWorker({ worker });
      assert.deepEqual(fake.rgn('us-west-2').terminatedInstances, []);
    });

    test('do not remove registered workers with stale terminateAfter', async function () {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'running';
      const worker = Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.REQUESTED,
        providerData: {
          ...workerInDB.providerData,
          terminateAfter: Date.now() - 1000,
        },
      });
      await worker.create(helper.db);
      provider.seen = {};
      worker.reload = function () {
        this.providerData.terminateAfter = Date.now() + 1000;
      };

      await provider.checkWorker({ worker });
      assert.deepEqual(fake.rgn('us-west-2').terminatedInstances, []);
    });

    test('remove very old workers', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'running';
      const worker = Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.REQUESTED,
        providerData: {
          ...workerInDB.providerData,
          terminateAfter: Date.now() - 1000,
        },
      });
      await worker.create(helper.db);
      provider.seen = {};
      await provider.checkWorker({ worker });
      assert.deepEqual(fake.rgn('us-west-2').terminatedInstances, ['i-123']);
    });

    test('don\'t remove current workers', async function() {
      fake.rgn('us-west-2').instanceStatuses['i-123'] = 'running';
      const worker = Worker.fromApi({
        ...workerInDB,
        workerId: 'i-123',
        state: Worker.states.REQUESTED,
        providerData: {
          ...workerInDB.providerData,
          terminateAfter: Date.now() + 1000,
        },
      });
      await worker.create(helper.db);
      provider.seen = {};
      await provider.checkWorker({ worker });
      assert.deepEqual(fake.rgn('us-west-2').terminatedInstances, []);
    });
  });

  suite('AWS provider - removeWorker', function() {

    test('successfully terminated instance', async function() {
      const worker = {
        ...defaultWorker,
        providerData: {
          ...defaultWorker.providerData,
          region: 'us-west-2',
        },
        workerId: 'i-123',
      };
      await assert.doesNotReject(provider.removeWorker({ worker, reason: 'removed' }));
    });

    test('calls quarantineWorker', async function() {
      const worker = {
        ...defaultWorker,
        providerData: {
          ...defaultWorker.providerData,
          region: 'us-west-2',
        },
        workerId: 'i-123',
      };
      await provider.removeWorker({ worker, reason: 'removed' });

      const lastQuarantine = helper.queue.quarantines[helper.queue.quarantines.length - 1];
      assert.equal(lastQuarantine.workerId, 'i-123');
      assert.equal(lastQuarantine.payload.quarantineInfo, 'removed');
    });

  });

});
