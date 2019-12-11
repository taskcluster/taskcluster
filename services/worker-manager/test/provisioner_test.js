const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const monitorManager = require('../src/monitor');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);

  suite('provisioning loop', function() {
    const testCase = async ({workers = [], workerPools = [], assertion, expectErrors = false}) => {
      await Promise.all(workers.map(w => helper.Worker.create(w)));
      await Promise.all(workerPools.map(async wt => {
        if (wt.input) {
          await helper.workerManager.createWorkerPool(wt.workerPoolId, wt.input);
        } else {
          await helper.WorkerPool.create(wt);
        }
      }));
      return (testing.runWithFakeTime(async function() {

        await helper.initiateProvisioner();
        await testing.poll(async () => {
          if (!expectErrors) {
            const error = monitorManager.messages.find(({Type}) => Type === 'monitor.error');
            if (error) {
              throw new Error(JSON.stringify(error, null, 2));
            }
          }
          await Promise.all(workerPools.map(async wt => {
            const pId = wt.providerId || wt.input.providerId;
            assert.deepEqual(
              monitorManager.messages.find(
                msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === wt.workerPoolId), {
                Logger: 'taskcluster.worker-manager.provisioner',
                Type: 'worker-pool-provisioned',
                Fields: {workerPoolId: wt.workerPoolId, providerId: pId, v: 1},
                Severity: LEVELS.info,
              });
            assert.deepEqual(
              monitorManager.messages.find(
                msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === wt.workerPoolId), {
                Logger: `taskcluster.worker-manager.provider.${pId}`,
                Type: 'test-provision',
                Fields: {workerPoolId: wt.workerPoolId, existingCapacity: wt.existingCapacity},
                Severity: LEVELS.notice,
              });
          }));
          if (assertion) {
            await assertion();
          }
        });
        await helper.terminateProvisioner();
        if (expectErrors) {
          monitorManager.messages = [];
        }
      }, {
        mock,
        maxTime: 30000,
      }))();
    };

    test('single worker pool', () => testCase({
      workerPools: [
        {
          workerPoolId: 'pp/ee',
          existingCapacity: 0,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('single worker pool (with running worker)', () => testCase({
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
          state: helper.Worker.states.RUNNING,
          providerData: {},
        },
      ],
      workerPools: [
        {
          workerPoolId: 'ff/ee',
          existingCapacity: 1,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('multiple worker pools, same provider', () => testCase({
      workerPools: [
        {
          workerPoolId: 'pp/ee',
          existingCapacity: 0,
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
          existingCapacity: 0,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('multiple worker pools, different provider', () => testCase({
      workerPools: [
        {
          workerPoolId: 'pp/ee',
          existingCapacity: 0,
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
          existingCapacity: 0,
          input: {
            providerId: 'testing2',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
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
        },
        {
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
        assert.deepEqual(monitorManager.messages.find(
          msg => msg.Type === 'remove-resource' && msg.Logger.endsWith('testing1')), {
          Logger: `taskcluster.worker-manager.provider.testing1`,
          Type: 'remove-resource',
          Fields: {workerPoolId: 'ff/ee'},
          Severity: LEVELS.notice,
        });
      },
    }));
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
        Logger: 'taskcluster.worker-manager.provider.testing1',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });

    test('message with unknown provider', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'no-such-provider',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-created',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), undefined);
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
        Logger: 'taskcluster.worker-manager.provider.testing1',
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
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.provider.testing2',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });
  });

  suite('provision', function() {
    test('provision scan provisions a worker pool', async function() {
      await helper.WorkerPool.create({
        workerPoolId: 'pp/ww',
        providerId: 'testing1',
        previousProviderIds: [],
        description: '',
        created: new Date(),
        lastModified: new Date(),
        config: {},
        owner: 'me@example.com',
        emailOnError: false,
        providerData: {},
      });
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'worker-pool-provisioned',
          Fields: {workerPoolId: 'pp/ww', providerId: 'testing1', v: 1},
          Severity: LEVELS.info,
        });
    });

    test('provision scan skips worker pools with unknown providerId', async function() {
      await helper.WorkerPool.create({
        workerPoolId: 'pp/ww',
        providerId: 'NO-SUCH',
        previousProviderIds: [],
        description: '',
        created: new Date(),
        lastModified: new Date(),
        config: {},
        owner: 'me@example.com',
        emailOnError: false,
        providerData: {},
      });
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'),
        undefined);
      assert.deepEqual(
        monitorManager.messages.find(msg => msg.Type === 'monitor.generic'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'monitor.generic',
          Fields: {message: 'Worker pool pp/ww has unknown providerId NO-SUCH'},
          Severity: LEVELS.warning,
        });
    });

    test('provision scan skips worker pools with unknown previous providerId', async function() {
      await helper.WorkerPool.create({
        workerPoolId: 'pp/ww',
        providerId: 'testing1',
        previousProviderIds: ['NO-SUCH'],
        description: '',
        created: new Date(),
        lastModified: new Date(),
        config: {},
        owner: 'me@example.com',
        emailOnError: false,
        providerData: {},
      });
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'worker-pool-provisioned',
          Fields: {workerPoolId: 'pp/ww', providerId: 'testing1', v: 1},
          Severity: LEVELS.info,
        });
      assert.deepEqual(
        monitorManager.messages.find(msg => msg.Type === 'monitor.generic'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'monitor.generic',
          Fields: {message: 'Worker pool pp/ww has unknown previousProviderIds entry NO-SUCH (ignoring)'},
          Severity: LEVELS.info,
        });
    });
  });

  suite('deprovisioning loop', function() {
    test('create and destroy', async function() {
      const workerPool = {
        workerPoolId: 'pp/ee',
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      };
      await helper.workerManager.createWorkerPool(workerPool.workerPoolId, workerPool.input);
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.worker-manager.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {workerPoolId: workerPool.workerPoolId, existingCapacity: 0},
          Severity: LEVELS.notice,
        });

      await monitorManager.reset(); // So we can assert there is no provisioning message this time
      workerPool.input.providerId = 'null-provider';
      await helper.workerManager.updateWorkerPool(workerPool.workerPoolId, workerPool.input);
      await provisioner.provision();

      assert(!monitorManager.messages.find(msg => msg.Type === 'test-provision'));
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-deprovision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: 'taskcluster.worker-manager.provider.testing1', // This is the old providerId
          Type: 'test-deprovision',
          Fields: {workerPoolId: workerPool.workerPoolId},
          Severity: LEVELS.notice,
        });
    });

    test('create and change', async function() {
      const workerPool = {
        workerPoolId: 'pp/ee',
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      };
      await helper.workerManager.createWorkerPool(workerPool.workerPoolId, workerPool.input);
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.worker-manager.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {workerPoolId: workerPool.workerPoolId, existingCapacity: 0},
          Severity: LEVELS.notice,
        });

      await monitorManager.reset(); // So we can assert there is no provisioning message this time
      workerPool.input.providerId = 'testing2';
      await helper.workerManager.updateWorkerPool(workerPool.workerPoolId, workerPool.input);
      await provisioner.provision();

      assert(!monitorManager.messages.find(msg => msg.Type === 'test-provision' && msg.Logger.endsWith('testing1')));
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-deprovision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: 'taskcluster.worker-manager.provider.testing1', // This is the old providerId
          Type: 'test-deprovision',
          Fields: {workerPoolId: workerPool.workerPoolId},
          Severity: LEVELS.notice,
        });
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.worker-manager.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {workerPoolId: workerPool.workerPoolId, existingCapacity: 0},
          Severity: LEVELS.notice,
        });
    });
  });
});
