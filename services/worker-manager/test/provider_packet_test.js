const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const {PacketProvider} = require('../src/providers/packet');
const testing = require('taskcluster-lib-testing');
const _ = require('lodash');
const sinon = require('sinon');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;
  let workerPool;
  let providerId = 'packet';
  let workerPoolId = 'foo/bar';
  let stub;

  const MAX_CAPACITY = 3;

  setup(async function() {
    stub = sinon.stub(taskcluster, 'createTemporaryCredentials');
    stub.returns({
      clientId: 'myclientid',
      accessToken: 'myaccessToken',
    });

    provider = new PacketProvider({
      providerId,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('packet'),
      estimator: {
        simple: () => 3,
      },
      fake: true,
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
      apiKey: '1234567890',
      projectId: '1234567890',
    });
    workerPool = await helper.WorkerPool.create({
      workerPoolId,
      providerId,
      description: 'none',
      previousProviderIds: [],
      created: new Date(),
      lastModified: new Date(),
      config: {
        minCapacity: 1,
        maxCapacity: MAX_CAPACITY,
        capacityPerInstance: 1,
        plan: 't1.small.x86',
        facilities: ['scn1'],
        billingCycle: 'hourly',
        ipAddress: {
          adddress_famility: 4,
          public: true,
        },
        userData: {},
        imageRepo: 'git://github.com/taskcluster/packet-image',
        imageTag: '1234567890',
        operatingSystem: 'ubuntu_18_04',
        maxBid: 0.15,
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
    });
    await provider.setup();
  });

  teardown(async function() {
    stub.restore();
  });

  test('Test packet loop', async () => {
    const worker = await provider.provision({workerPool});
    assert.equal(worker.providerData.deletedDevices, 0);
    assert.equal(_.size(provider.packet.spotRequests), 1);
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert.equal(_.size(provider.packet.devices), MAX_CAPACITY);
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert.ok(_.every(provider.packet.devices, dev => dev.state === 'active'));
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    assert.equal(_.size(provider.packet.devices), 0);
  });
});
