const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);

  suite('provisioning loop', function() {
    const testCase = (workerTypes) => {
      return testing.runWithFakeTime(async function() {
        await Promise.all(workerTypes.map(async wt => {
          await helper.workerManager.createWorkerType(wt.name, wt.input);
          helper.queue.setPending('worker-manager', wt.name, wt.pending);
        }));

        await helper.initiateProvisioner();
        await testing.poll(async () => {
          const error = monitorManager.messages.find(({Type}) => Type === 'monitor.error');
          if (error) {
            throw new Error(JSON.stringify(error, null, 2));
          }
          await Promise.all(workerTypes.map(async wt => {
            assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'workertype-provisioned' && msg.Fields.workerType === wt.name), {
              Logger: 'taskcluster.worker-manager.provisioner',
              Type: 'workertype-provisioned',
              Fields: {workerType: wt.name, provider: wt.input.provider, v: 1},
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

    test('single workertype', testCase([
      {
        name: 'ee',
        pending: 1,
        input: {
          provider: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
        },
      },
    ]));

    test('multiple workertypes, same provider', testCase([
      {
        name: 'ee',
        pending: 1,
        input: {
          provider: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
        },
      },
      {
        name: 'ee2',
        pending: 100,
        input: {
          provider: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
        },
      },
    ]));

    test('multiple workertypes, different provider', testCase([
      {
        name: 'ee',
        pending: 1,
        input: {
          provider: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
        },
      },
      {
        name: 'ee2',
        pending: 100,
        input: {
          provider: 'testing2',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
        },
      },
    ]));
  });

  suite('workertype exchanges', function() {
    let workerType;
    setup(async function() {
      const now = new Date();
      workerType = await helper.WorkerType.create({
        name: 'foo',
        provider: 'testing1',
        description: 'none',
        scheduledForDeletion: false,
        created: now,
        lastModified: now,
        config: {},
        owner: 'whoever@example.com',
        providerData: {},
      });
      await helper.initiateProvisioner();
    });
    teardown(async function() {
      await helper.terminateProvisioner();
    });

    test('workertype created', async function() {
      await helper.fakePulseMessage({
        payload: {
          name: 'foo',
          provider: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-created',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'create-resource',
        Severity: 5,
        Fields: {workerType: 'foo'},
      });
    });

    test('workertype modified, same provider', async function() {
      await helper.fakePulseMessage({
        payload: {
          name: 'foo',
          provider: 'testing1',
          previousProvider: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'update-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'update-resource',
        Severity: 5,
        Fields: {workerType: 'foo'},
      });
    });

    test('workertype modified, different provider', async function() {
      await workerType.modify(wt => {
        wt.provider = 'testing2';
      });
      await helper.fakePulseMessage({
        payload: {
          name: 'foo',
          provider: 'testing2',
          previousProvider: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'remove-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'remove-resource',
        Severity: 5,
        Fields: {workerType: 'foo'},
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.testing2',
        Type: 'create-resource',
        Severity: 5,
        Fields: {workerType: 'foo'},
      });
    });

    test('workertype deleted', async function() {
      await helper.fakePulseMessage({
        payload: {
          name: 'foo',
          provider: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-deleted',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'remove-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'remove-resource',
        Severity: 5,
        Fields: {workerType: 'foo'},
      });
    });
  });
});
