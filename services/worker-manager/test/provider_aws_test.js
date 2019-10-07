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

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster'], function(mock, skipping) {
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
    },
    owner: 'whatever@example.com',
    providerData: {},
    emailOnError: false,
  };
  const TagSpecifications = [
    ...(defaultLaunchConfig.launchConfig.TagSpecifications ? defaultLaunchConfig.launchConfig.TagSpecifications : []),
    {
      ResourceType: 'instance',
      Tags: [
        {
          Key: 'CreatedBy',
          Value: `taskcluster-wm-${providerId}`,
        }, {
          Key: 'Owner',
          Value: workerPool.owner,
        },
        {
          Key: 'ManagedBy',
          Value: 'taskcluster',
        },
        {
          Key: 'Name',
          Value: `${workerPoolId}`,
        }],
    },
  ];
  const UserData = {
    rootUrl: helper.rootUrl,
    workerPoolId,
    providerId,
    workerGroup: providerId,
  };
  const defaultWorker = {
    workerPoolId,
    workerGroup: providerId,
    providerId,
    created: taskcluster.fromNow('0 seconds'),
    expires: taskcluster.fromNow('90 seconds'),
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
      describeRegions: fakeAWS.EC2.describeRegions,
      runInstances: fakeAWS.EC2.runInstances({defaultLaunchConfig, TagSpecifications, UserData}),
    });

    await provider.setup();
  });

  suite('AWS provider - provision', function() {

    test('positive test', async function() {
      await provider.provision({workerPool});
      const workers = await helper.Worker.scan({}, {});

      assert.notStrictEqual(workers.entries.length, 0);

      workers.entries.forEach(w => {
        assert.strictEqual(w.workerPoolId, workerPoolId, 'Worker was created for a wrong worker pool');
        assert.strictEqual(w.workerGroup, providerId, 'Worker group id should be the same as provider id');
        assert.strictEqual(w.state, helper.Worker.states.REQUESTED, 'Worker should be marked as requested');
        assert.strictEqual(w.providerData.region, defaultLaunchConfig.region, 'Region should come from the chosen config');
      });
      sinon.restore();
    });

    test('instance tags in launch spec - should merge them with our instance tags', async function() {
      sinon.restore();
    });

    test('no instance tags in launch spec, but other tags - should have 1 object per resource type', async function() {
      sinon.restore();
    });

    test('UserData should be base64 encoded', async function() {
      sinon.restore();
    });
  });

  suite('[UNIT] AWS provider - registerWorker - negative test cases', function() {
    // For the positive integration test, see api_test.js, registerWorker endpoint

    test('registerWorker - verifyInstanceIdentityDocument - bad document', async function() {
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT_bad')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_SIGNATURE')).toString(),
      };

      await assert.rejects(
        () => provider.registerWorker({worker: workerInDB, workerPool, workerIdentityProof}),
        new ApiError('Instance identity document validation error'),
        'Should fail to verify iid (the document has been edited)'
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
        'Should fail to verify iid (the signature was produced with a wrong key)'
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
        'Should fail to verify iid (the signature is wrong)'
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
        'Should fail to verify worker (info from the signature and info from our DB differ)'
      );
      sinon.restore();
    });

    test('registerWorker - no signature', async function() {
      const workerIdentityProof = {
        "document": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_DOCUMENT')).toString(),
        "signature": fs.readFileSync(path.resolve(__dirname, 'fixtures/aws_iid_EMPTYFILE')).toString(),
      };

      await assert.rejects(() => provider.registerWorker({worker: workerInDB, workerPool, workerIdentityProof}),
        new ApiError('Token validation error'),
        'Should fail because there is no signature'
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
        'Should fail because the worker is already running'
      );

      sinon.restore();

    });
  });

  suite('AWS provider - checkWorker', function() {

    test('stopped and terminated instances - should be marked as STOPPED in DB', async function() {
      sinon.restore();
    });

    test('pending/running,/shutting-down/stopping instances - should not reject', async function() {
      sinon.restore();
    });

    test('some strange status - should reject', async function() {
      sinon.restore();
    });

    test('instance terminated by hand - should be marked as STOPPED in DB; should not reject', async function() {
      sinon.restore();
    });
  });

});
