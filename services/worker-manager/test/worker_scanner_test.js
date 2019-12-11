const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const monitorManager = require('../src/monitor');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withWorkerScanner(mock, skipping);

  const testCase = async ({workers = [], assertion, expectErrors}) => {
    await Promise.all(workers.map(w => helper.Worker.create(w)));
    return (testing.runWithFakeTime(async () => {
      await helper.initiateWorkerScanner();
      await testing.poll(async () => {
        if (!expectErrors) {
          const error = monitorManager.messages.find(({Type}) => Type === 'monitor.error');
          if (error) {
            throw new Error(JSON.stringify(error, null, 2));
          }
        }
        workers.forEach(w => {
          assert.deepEqual(monitorManager.messages.find(
            msg => msg.Type === 'scan-prepare' && msg.Logger.endsWith(w.providerId)), {
            Logger: `taskcluster.worker-manager.provider.${w.providerId}`,
            Type: 'scan-prepare',
            Fields: {},
            Severity: LEVELS.notice,
          });
          assert.deepEqual(monitorManager.messages.find(
            msg => msg.Type === 'scan-cleanup' && msg.Logger.endsWith(w.providerId)), {
            Logger: `taskcluster.worker-manager.provider.${w.providerId}`,
            Type: 'scan-cleanup',
            Fields: {},
            Severity: LEVELS.notice,
          });
        });
        await assertion();
      }, 60, 1000);
      await helper.terminateWorkerScanner();

      if (expectErrors) {
        monitorManager.messages = [];
      }
    }, {
      mock,
      maxTime: 120000,
    }))();
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
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: helper.Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker = await helper.Worker.load({
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker.providerData.checked);
    },
  }));

  test('multiple workers with same provider', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: helper.Worker.states.REQUESTED,
        providerData: {},
      },
      {
        workerPoolId: 'ff/dd',
        workerGroup: 'whatever',
        workerId: 'testing-124',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: helper.Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker1 = await helper.Worker.load({
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker1.providerData.checked);
      const worker2 = await helper.Worker.load({
        workerPoolId: 'ff/dd',
        workerGroup: 'whatever',
        workerId: 'testing-124',
      });
      assert(worker2.providerData.checked);
    },
  }));

  test('multiple workers with different providers', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: helper.Worker.states.REQUESTED,
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
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: helper.Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker1 = await helper.Worker.load({
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker1.providerData.checked);
      const worker2 = await helper.Worker.load({
        workerPoolId: 'ff/dd',
        workerGroup: 'whatever',
        workerId: 'testing-124',
      });
      assert(worker2.providerData.checked);
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
        state: helper.Worker.states.STOPPED,
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
        state: helper.Worker.states.REQUESTED,
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
      const worker = await helper.Worker.load({
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker.providerData.checked);
    },
  }));
});
