
const assume = require('assume');
const {client: _client, server: _server} = require('./helper');
const fs = require('fs');
const path = require('path');

suite('API', () => {
  let server;
  let client; 
  let workerConfig;

  suiteSetup(async () => {
    client = await _client;
    server = await _server;
  });

  setup(async () => {
    workerConfig = await new Promise((resolve, reject) => {
      fs.readFile(path.join(__dirname, 'convert-expected.json'), (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
  });

  suiteTeardown(async () => {
    (await server).terminate();
  });

  suite('worker configs', () => {
    test('should list, create, retrieve, update and remove worker configs', async () => {
      let name = 'worker-config-1';
      workerConfig.id = name;

      // Should start with no worker configurations
      assume(await client.listWorkerConfigurations()).has.lengthOf(0);

      // Should create worker configuration (idempotent)
      await client.createWorkerConfiguration(name, workerConfig);
      await client.createWorkerConfiguration(name, workerConfig);
      assume(await client.listWorkerConfigurations()).has.lengthOf(1);

      // Should retrieve worker configuration
      let oldWorkerConfig = await client.getWorkerConfiguration(name);
      assume(oldWorkerConfig).deeply.equals(workerConfig);

      // Should update worker configuration
      workerConfig.rules[0].id = 'rule-1';
      await client.updateWorkerConfiguration(name, workerConfig);
      let newWorkerConfig = await client.getWorkerConfiguration(name);
      assume(newWorkerConfig).deeply.equals(workerConfig);

      // Should be able to remove worker configuration
      await client.removeWorkerConfiguration(name);
      assume(await client.listWorkerConfigurations()).has.lengthOf(0);

      // Removing a non-existing worker configuration should not exist
      await client.removeWorkerConfiguration(name);

      // Should throw an error when requesting a worker configuration which
      // doesn't exist
      await assume(() => client.getWorkerConfiguration(name)).rejects();
      await assume(() => client.updateWorkerConfiguration(name, workerConfig)).rejects();
    });

    test('should raise an error when a different worker config has same worker type', async () => {
      let name1 = 'worker-config-1';
      let name2 = 'worker-config-2';

      workerConfig.id = name1;

      await client.createWorkerConfiguration(workerConfig.id, workerConfig);

      workerConfig.id = name2;
      await assume(client.createWorkerConfiguration(workerConfig.id, workerConfig)).rejects();
      await assume(client.updateWorkerConfiguration(workerConfig.id, workerConfig)).rejects();
      await client.removeWorkerConfiguration(name1);
      await client.removeWorkerConfiguration(name2);
    });

    test('should be able to preview worker configuration', async () => {
      await client.createWorkerConfiguration(workerConfig.id, workerConfig);

      let result = await client.testWorkerConfiguration({
        workerConfiguration: workerConfig,
        satisfiers: {
          biddingStrategyId: 'queue-pending-ratio',
          workerType: 'gecko-3-b-linux',
          region: 'us-east-1',
          instanceType: 'c5d.4xlarge',
          availabilityZone: 'us-east-1a',
        },
      });
      assume(result).deeply.equals(JSON.parse(fs.readFileSync(path.join(__dirname, 'convert-eval-expected.json'))));
    });

    test('should be able to test worker configuration', async () => {
      let result = await client.testWorkerConfiguration({
        workerConfiguration: workerConfig,
        satisfiers: {
          biddingStrategyId: 'queue-pending-ratio',
          workerType: 'gecko-3-b-linux',
          region: 'us-east-1',
          instanceType: 'c5d.4xlarge',
          availabilityZone: 'us-east-1a',
        },
      });
      assume(result).deeply.equals(JSON.parse(fs.readFileSync(path.join(__dirname, 'convert-eval-expected.json'))));
    });
  });
});
