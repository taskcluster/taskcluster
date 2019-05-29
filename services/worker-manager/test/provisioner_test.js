const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');
const {LEVELS} = require('taskcluster-lib-monitor');
const {splitWorkerPoolId} = require('../src/util');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);

  suite('provisioning loop', function() {
    const testCase = (workerPools) => {
      return testing.runWithFakeTime(async function() {
        await Promise.all(workerPools.map(async wt => {
          await helper.workerManager.createWorkerPool(wt.workerPoolId, wt.input);
          const {provisionerId, workerPool} = splitWorkerPoolId(wt.workerPoolId);
          helper.queue.setPending(provisionerId, workerPool, wt.pending);
        }));

        await helper.initiateProvisioner();
        await testing.poll(async () => {
          const error = monitorManager.messages.find(({Type}) => Type === 'monitor.error');
          if (error) {
            throw new Error(JSON.stringify(error, null, 2));
          }
          await Promise.all(workerPools.map(async wt => {
            assert.deepEqual(
              monitorManager.messages.find(
                msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === wt.workerPoolId), {
                Logger: 'taskcluster.worker-manager.provisioner',
                Type: 'worker-pool-provisioned',
                Fields: {workerPoolId: wt.workerPoolId, providerId: wt.input.providerId, v: 1},
                Severity: LEVELS.info,
              });
          }));
        });
        await helper.terminateProvisioner();
      }, {
        mock,
        maxTime: 30000,
      });
    };

    test('single worker pool', testCase([
      {
        workerPoolId: 'pp/ee',
        pending: 1,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));

    test('multiple worker pools, same provider', testCase([
      {
        workerPoolId: 'pp/ee',
        pending: 1,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
      {
        workerPoolId: 'pp/ee2',
        pending: 100,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));

    test('multiple worker pools, different provider', testCase([
      {
        workerPoolId: 'pp/ee',
        pending: 1,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
      {
        workerPoolId: 'pp/ee2',
        pending: 100,
        input: {
          providerId: 'testing2',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));
  });

  suite('worker pool exchanges', function() {
    let workerPool;
    setup(async function() {
      const now = new Date();
      workerPool = await helper.WorkerPool.create({
        workerPoolId: 'pp/foo',
        providerId: 'testing1',
        description: 'none',
        previousProviderIds: [],
        created: now,
        lastModified: now,
        config: {},
        owner: 'whoever@example.com',
        providerData: {},
        emailOnError: false,
      });
      await helper.initiateProvisioner();
    });
    teardown(async function() {
      await helper.terminateProvisioner();
    });

    test('worker pool created', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-created',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });

    test('worker pool modified, same provider', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'testing1',
          previousProviderId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'update-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'update-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });

    test('worker pool modified, different provider', async function() {
      await workerPool.modify(wt => {
        wt.providerId = 'testing2';
      });
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'testing2',
          previousProviderId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'remove-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'remove-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.testing2',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });

    test('worker pool deleted', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-deleted',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'remove-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'remove-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });
  });
});
