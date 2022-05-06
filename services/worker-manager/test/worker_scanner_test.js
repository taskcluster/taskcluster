const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const { LEVELS } = require('taskcluster-lib-monitor');
const { Worker } = require('../src/data');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withWorkerScanner(mock, skipping);
  helper.resetTables(mock, skipping);

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  // for testing an expiration that will be updated
  const expires = taskcluster.fromNow('6 days');
  // for testing an expiration that won't be updated
  const expires2 = taskcluster.fromNow('8 days');

  const testCase = async ({ workers = [], assertion, expectErrors }) => {
    await Promise.all(workers.map(w => {
      const worker = Worker.fromApi(w);
      return worker.create(helper.db);
    }));
    await helper.initiateWorkerScanner();
    await testing.poll(async () => {
      if (!expectErrors) {
        const error = monitor.manager.messages.find(({ Type }) => Type === 'monitor.error');
        if (error) {
          throw new Error(JSON.stringify(error, null, 2));
        }
      }
      workers.forEach(w => {
        assert.deepEqual(monitor.manager.messages.find(
          msg => msg.Type === 'scan-prepare' && msg.Logger.endsWith(w.providerId)), {
          Logger: `taskcluster.test.provider.${w.providerId}`,
          Type: 'scan-prepare',
          Fields: {},
          Severity: LEVELS.notice,
        });
        assert.deepEqual(monitor.manager.messages.find(
          msg => msg.Type === 'scan-cleanup' && msg.Logger.endsWith(w.providerId)), {
          Logger: `taskcluster.test.provider.${w.providerId}`,
          Type: 'scan-cleanup',
          Fields: {},
          Severity: LEVELS.notice,
        });
      });
      await assertion();
    }, 60, 1000);
    await helper.terminateWorkerScanner();

    if (expectErrors) {
      monitor.manager.reset();
    }
  };

  test('single worker', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: expires2,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker = await Worker.get(helper.db, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker.providerData.checked);
      // verify that expires wasn't updated
      assert.notEqual(worker.providerexpires, expires2);
    },
  }));

  test("multiple workers with same provider", () => testCase({
    workers: [
      {
        workerPoolId: "ff/ee",
        workerGroup: "whatever",
        workerId: "testing-123",
        providerId: "testing1",
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
      {
        workerPoolId: "ff/dd",
        workerGroup: "whatever",
        workerId: "testing-124",
        providerId: "testing1",
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker1 = await Worker.get(helper.db, {
        workerPoolId: "ff/ee",
        workerGroup: "whatever",
        workerId: "testing-123",
      });
      assert(worker1.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker1.expires > expires);
      const worker2 = await Worker.get(helper.db, {
        workerPoolId: "ff/dd",
        workerGroup: "whatever",
        workerId: "testing-124",
      });
      assert(worker2.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker2.expires > expires);
    },
  }));

  test('multiple nearly expired workers with different providers', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
      {
        workerPoolId: 'ff/dd',
        workerGroup: 'whatever',
        workerId: 'testing-124',
        providerId: 'testing2',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker1 = await Worker.get(helper.db, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker1.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker1.expires > expires);
      const worker2 = await Worker.get(helper.db, {
        workerPoolId: 'ff/dd',
        workerGroup: 'whatever',
        workerId: 'testing-124',
      });
      assert(worker2.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker2.expires > expires);
    },
  }));

  test('worker for previous provider is stopped', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-OLD',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: Worker.states.STOPPED,
        providerData: {},
      }, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing2',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    workerPools: [
      {
        workerPoolId: 'ff/ee',
        existingCapacity: 1,
        providerId: 'testing2',
        previousProviderIds: ['testing1'],
        description: '',
        created: taskcluster.fromNow('-1 hour'),
        lastModified: taskcluster.fromNow('-1 hour'),
        config: {},
        owner: 'foo@example.com',
        emailOnError: false,
        providerData: {
          // make removeResources fail on the first try, to test error handling
          failRemoveResources: 1,
        },
      },
    ],
    expectErrors: true,
    assertion: async () => {
      const worker = await Worker.get(helper.db, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker.providerData.checked);
    },
  }));

  test('default providers filter applied', async () => {
    const azureScanner = await helper.load('workerScannerAzure');
    assert.deepEqual(azureScanner.providersFilter, { cond: '=', value: 'azure' });
    await azureScanner.terminate();

    const scanner = await helper.load('workerScanner');
    assert.deepEqual(scanner.providersFilter, { cond: '<>', value: 'azure' });
    await scanner.terminate();
  });
});
