const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster'], function(mock, skipping) {
  helper.withMonitor(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);

  const testCase = (workerTypes) => {
    return testing.runWithFakeTime(async function() {
      await Promise.all(workerTypes.map(async wt => {
        await helper.workerManager.createWorkerType(wt.name, wt.input);
        helper.queue.setPending('worker-manager', wt.name, wt.pending);
      }));

      await helper.initiateProvisioner();
      await testing.poll(async () => {
        const error = helper.monitor.messages.find(({Type}) => Type === 'monitor.error');
        if (error) {
          throw new Error(JSON.stringify(error, null, 2));
        }
        await Promise.all(workerTypes.map(async wt => {
          assert.deepEqual(helper.monitor.messages.find(msg => msg.Type === 'workertype-provision' && msg.Fields.workerType === wt.name), {
            Logger: 'taskcluster.worker-manager.root.provisioner',
            Type: 'workertype-provision',
            Fields: {workerType: wt.name, provider: wt.input.provider, v: 1},
          });
        }));
      }, 10);
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
        configTemplate: {},
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
        configTemplate: {},
      },
    },
    {
      name: 'ee2',
      pending: 100,
      input: {
        provider: 'testing1',
        description: 'bar',
        configTemplate: {},
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
        configTemplate: {},
      },
    },
    {
      name: 'ee2',
      pending: 100,
      input: {
        provider: 'testing2',
        description: 'bar',
        configTemplate: {},
      },
    },
  ]));

});
