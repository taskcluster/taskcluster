const {ApiError} = require('../src/providers/provider');
const assert = require('assert');
const sinon = require('sinon');
const helper = require('./helper');
const {AwsProvider} = require('../src/providers/aws');
const testing = require('taskcluster-lib-testing');
const aws = require('aws-sdk');
const fakeAWS = require('./fake-aws');
const fs = require('fs');
const path = require('path');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;
  const providerId = 'aws';
  const workerPoolId = 'foo/bar';
  const defaultLaunchConfig = {
    region: 'us-west-2',
    capacityPerInstance: 1,
    launchConfig: {
      ImageId: 'banana-123',
    },
    workerConfig: {foo: 5},
  };
  let workerPool = {
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
      maxCapacity: 2,
      lifecycle: {
        registrationTimeout: 6000,
      },
    },
    owner: 'whatever@example.com',
    providerData: {},
    emailOnError: false,
  };
  const defaultWorker = {
    workerPoolId,
    workerGroup: providerId,
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

  setup(async function() {
    provider = new AwsProvider({
      providerId,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('aws'),
      estimator: await helper.load('estimator'),
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
      WorkerPoolError: helper.WorkerPoolError,
      providerConfig: {
        providerType: 'aws',
        credentials: {
          accessKeyId: 'accesskeyid',
          secretAccessKey: 'topsecret',
        },
      },
    });

    workerPool = await helper.WorkerPool.create(workerPool);

    sinon.stub(aws, 'EC2').returns({
      ...fakeAWS.EC2,
      runInstances: fakeAWS.EC2.runInstances(),
      terminateInstances: fakeAWS.EC2.terminateInstances(),
    });

    await provider.setup();
  });

  suite('AWS provider - provision', function() {

    test('positive test', async function() {
      const now = Date.now();
      await provider.provision({workerPool, existingCapacity: 0});
      const workers = await helper.Worker.scan({}, {});

      assert.notStrictEqual(workers.entries.length, 0);

      workers.entries.forEach(w => {
        assert.strictEqual(w.workerPoolId, workerPoolId, 'Worker was created for a wrong worker pool');
        assert.strictEqual(w.workerGroup, providerId, 'Worker group id should be the same as provider id');
        assert.strictEqual(w.state, helper.Worker.states.REQUESTED, 'Worker should be marked as requested');
        assert.strictEqual(w.providerData.region, defaultLaunchConfig.region, 'Region should come from the chosen config');
        // Check that this is setting times correctly to within a second or so to allow for some time
        // for the provisioning loop
        assert(workers.entries[0].providerData.registrationExpiry - now - (6000 * 1000) < 5000);
      });
      sinon.restore();
    });

    test('spawns an appropriate number of instances', async function() {
      await workerPool.modify(wp => {
        wp.config = {
          launchConfigs: [
            {...defaultLaunchConfig, capacityPerInstance: 6},
            {...defaultLaunchConfig, capacityPerInstance: 6},
            {...defaultLaunchConfig, capacityPerInstance: 6},
            {...defaultLaunchConfig, capacityPerInstance: 6},
            {...defaultLaunchConfig, capacityPerInstance: 6},
          ],
          minCapacity: 34, // not a multiple of number of configs or capPerInstance
          maxCapacity: 34,
        };
      });
      await provider.provision({workerPool, existingCapacity: 0});
      const workers = await helper.Worker.scan({}, {});

      // capacity 34 at 6 per instance should be 6 instances..
      assert.strictEqual(workers.entries.length, 6);
      sinon.restore();
    });

    test('instance tags in launch spec - should merge them with our instance tags', async function() {
      await workerPool.modify(wp => {
        for (const lc of wp.config.launchConfigs) {
          lc.launchConfig.TagSpecifications = [{
            ResourceType: 'instance',
            Tags: [{Key: 'mytag', Value: 'testy'}],
          }];
        }
      });

      await provider.provision({workerPool, existingCapacity: 0});
      const workers = await helper.Worker.scan({}, {});

      assert.notStrictEqual(workers.entries.length, 0);
      assert.deepStrictEqual(
        ...aws.EC2().runInstances.calls.map(({launchConfig: {TagSpecifications}}) => TagSpecifications),
        [
          {
            ResourceType: 'instance',
            Tags: [
              {Key: 'mytag', Value: 'testy'},
              {Key: 'CreatedBy', Value: 'taskcluster-wm-aws'},
              {Key: 'Owner', Value: 'whatever@example.com'},
              {Key: 'ManagedBy', Value: 'taskcluster'},
              {Key: 'Name', Value: 'foo/bar'},
              {Key: "WorkerPoolId", Value: "foo/bar"},
            ],
          },
        ],
      );

      sinon.restore();
    });

    test('no instance tags in launch spec, but other tags - should have 1 object per resource type', async function() {
      await workerPool.modify(wp => {
        for (const lc of wp.config.launchConfigs) {
          lc.launchConfig.TagSpecifications = [{
            ResourceType: 'launch-template',
            Tags: [{Key: 'fruit', Value: 'banana'}],
          }];
        }
      });

      await provider.provision({workerPool, existingCapacity: 0});
      const workers = await helper.Worker.scan({}, {});

      assert.notStrictEqual(workers.entries.length, 0);
      assert.deepStrictEqual(
        ...aws.EC2().runInstances.calls.map(({launchConfig: {TagSpecifications}}) => TagSpecifications),
        [
          {
            ResourceType: 'launch-template',
            Tags: [
              {Key: 'fruit', Value: 'banana'},
            ],
          },
          {
            ResourceType: 'instance',
            Tags: [
              {Key: 'CreatedBy', Value: 'taskcluster-wm-aws'},
              {Key: 'Owner', Value: 'whatever@example.com'},
              {Key: 'ManagedBy', Value: 'taskcluster'},
              {Key: 'Name', Value: 'foo/bar'},
              {Key: "WorkerPoolId", Value: "foo/bar"},
            ],
          },
        ],
      );

      sinon.restore();
    });

    test('UserData should be base64 encoded', async function() {
      await workerPool.modify(wp => {
        for (const lc of wp.config.launchConfigs) {
          lc.additionalUserData = {
            somethingImportant: "apple",
          };
        }
      });

      await provider.provision({workerPool, existingCapacity: 0});
      const workers = await helper.Worker.scan({}, {});

      assert.notStrictEqual(workers.entries.length, 0);
      assert.deepStrictEqual(
        JSON.parse(Buffer.from(
          aws.EC2().runInstances.calls[0].launchConfig.UserData,
          'base64' // eslint-disable-line comma-dangle
        ).toString()),
        {
          somethingImportant: 'apple',
          rootUrl: provider.rootUrl,
          workerPoolId: workerPool.workerPoolId,
          providerId: provider.providerId,
          workerGroup: provider.providerId,
          workerConfig: workerPool.config.launchConfigs[0].workerConfig,
        } // eslint-disable-line comma-dangle
      );

      sinon.restore();
    });
  });

  suite('[UNIT] AWS provider - registerWorker - negative test cases', function() {
    // For the positive integration test, see api_test.js, registerWorker endpoint

    test('registerWorker - verifyInstanceIdentityDocument - document is not string', async function() {
      const workerIdentityProof = {
        "document": {'instanceId': 'abc'},
        "signature": 'abcd',
      };

      await assert.rejects(
        () => provider.registerWorker({worker: workerInDB, workerPool, workerIdentityProof}),
        new ApiError('Request must include both a document (string) and a signature'),
      );
      sinon.restore();
    });

    test('registerWorker - verifyInstanceIdentityDocument - bad document', async function() {
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT_bad')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      await assert.rejects(
        () => provider.registerWorker({worker: workerInDB, workerPool, workerIdentityProof}),
        new ApiError('Instance identity document validation error'),
        'Should fail to verify iid (the document has been edited)',
      );
      sinon.restore();
    });

    test('registerWorker - verifyInstanceIdentityDocument - signature was produced with a wrong key', async function() {
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE_badKey')).toString(),
      };

      await assert.rejects(() => provider.registerWorker({worker: workerInDB, workerPool, workerIdentityProof}),
        new ApiError('Instance identity document validation error'),
        'Should fail to verify iid (the signature was produced with a wrong key)',
      );
      sinon.restore();
    });

    test('registerWorker - verifyInstanceIdentityDocument - signature is wrong', async function() {
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE_badSignature')).toString(),
      };

      await assert.rejects(() => provider.registerWorker({worker: workerInDB, workerPool, workerIdentityProof}),
        new ApiError('Instance identity document validation error'),
        'Should fail to verify iid (the signature is wrong)',
      );
      sinon.restore();
    });

    test('registerWorker - verifyWorkerInstance - document is legit but differs from what we know about the instance', async function() {
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
        () => provider.registerWorker({worker: differentWorkerInDB, workerPool, workerIdentityProof}),
        new ApiError('Instance validation error'),
        'Should fail to verify worker (info from the signature and info from our DB differ)',
      );
      sinon.restore();
    });

    test('registerWorker - no signature', async function() {
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_EMPTYFILE')).toString(),
      };

      await assert.rejects(() => provider.registerWorker({worker: workerInDB, workerPool, workerIdentityProof}),
        new ApiError('Request must include both a document (string) and a signature'),
      );
      sinon.restore();
    });

    test('registerWorker - worker is already running', async function() {
      const runningWorker = {
        ...workerInDB,
        state: 'running',
      };

      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      await assert.rejects(
        () => provider.registerWorker({worker: runningWorker, workerPool, workerIdentityProof}),
        new ApiError('This worker is either stopped or running. No need to register'),
        'Should fail because the worker is already running',
      );

      sinon.restore();

    });
  });

  suite('AWS provider - checkWorker', function() {

    test('stopped instances - should be marked as STOPPED in DB, should not add to seen', async function() {
      const worker = await helper.Worker.create({
        ...workerInDB,
        workerId: 'stopped', // stub function will return this as status
        state: helper.Worker.states.RUNNING,
      });

      provider.seen = {};
      await provider.checkWorker({worker: worker});

      const workers = await helper.Worker.scan({}, {});
      assert.notStrictEqual(workers.entries.length, 0);
      workers.entries.forEach(w =>
        assert.strictEqual(w.state, helper.Worker.states.STOPPED) // eslint-disable-line comma-dangle
      );
      assert.strictEqual(provider.seen[worker.workerPoolId], 0);

      sinon.restore();
    });

    test('pending/running,/shutting-down/stopping instances - should not reject', async function() {
      const worker = await helper.Worker.create({
        ...workerInDB,
        workerId: 'running', // stub function will return this as status
        state: helper.Worker.states.REQUESTED,
      });

      provider.seen = {};
      await provider.checkWorker({worker: worker});

      const workers = await helper.Worker.scan({}, {});
      assert.notStrictEqual(workers.entries.length, 0);
      workers.entries.forEach(w =>
        assert.strictEqual(w.state, helper.Worker.states.REQUESTED) // eslint-disable-line comma-dangle
      );
      assert.strictEqual(provider.seen[worker.workerPoolId], 1);

      sinon.restore();
    });

    test('some strange status - should reject', async function() {
      const worker = await helper.Worker.create({
        ...workerInDB,
        workerId: 'banana', // stub function will return this as status
        state: helper.Worker.states.REQUESTED,
      });

      provider.seen = {};
      await assert.rejects(provider.checkWorker({worker: worker}));
      assert.strictEqual(provider.seen[worker.workerPoolId], 0);

      sinon.restore();
    });

    test('instance terminated by hand - should be marked as STOPPED in DB; should not reject', async function() {
      const worker = await helper.Worker.create({
        ...workerInDB,
        workerId: 'terminated', // stub function will return this as status
        state: helper.Worker.states.RUNNING,
      });

      provider.seen = {};
      await provider.checkWorker({worker: worker});

      const workers = await helper.Worker.scan({}, {});
      assert.notStrictEqual(workers.entries.length, 0);
      workers.entries.forEach(w =>
        assert.strictEqual(w.state, helper.Worker.states.STOPPED) // eslint-disable-line comma-dangle
      );
      assert.strictEqual(provider.seen[worker.workerPoolId], 0);

      sinon.restore();
    });

    test('remove unregistered workers', async function() {
      const worker = await helper.Worker.create({
        ...workerInDB,
        workerId: 'running',
        state: helper.Worker.states.REQUESTED,
        providerData: {
          ...workerInDB.providerData,
          registrationExpiry: Date.now() - 1000,
        },
      });
      provider.seen = {};
      await provider.checkWorker({worker: worker});
      assert.equal(aws.EC2().terminateInstances.calls.length, 1);

      sinon.restore();
    });

    test('don\'t remove unregistered workers that are new', async function() {
      const worker = await helper.Worker.create({
        ...workerInDB,
        workerId: 'running',
        state: helper.Worker.states.REQUESTED,
        providerData: {
          ...workerInDB.providerData,
          registrationExpiry: Date.now() + 1000,
        },
      });
      provider.seen = {};
      await provider.checkWorker({worker: worker});
      assert.equal(aws.EC2().terminateInstances.calls.length, 0);

      sinon.restore();
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
      };
      await assert.doesNotReject(provider.removeWorker({worker}));
      sinon.restore();
    });

  });

});
