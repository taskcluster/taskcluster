const app = require('./fixtures/aws_metadata');
const http = require('http');
const awsConfig = require('../src/lib/host/aws');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const request = require('superagent-promise');

let server;
let url;

suite('configuration/aws', () => {
  setup((done) => {
    server = http.createServer(app.callback());
    server.listen(() => {
      url = 'http://localhost:' + server.address().port;
      done();
    });
  });

  teardown((done) => {
    server.close(done);
  });

  test('configuration', async () => {
    let response = await request.get(url + '/generate-secrets').end();
    let data = JSON.parse(response.text);
    let provisioner = new taskcluster.AwsProvisioner();
    await provisioner.createSecret(
      data.token,
      {
        token: data.token,
        workerType: 'ami-333333',
        secrets: {
          restrictedProxy: {
            accessToken: 'xyz'
          },
          dockerConfig: {
            token: 'docker-token'
          }
        },
        scopes: ['no-scope:for-anything:*'],
        expiration: taskcluster.fromNow('1 minute')
      }
    );

    let config = await awsConfig.configure(url);

    // values are mocked from the local aws metadata server
    // located in test/fixtures/aws_metadata.js.
    assert.deepEqual(config, {
      host: 'publichost',
      shutdown: {
        enabled: true,
        minimumCycleSeconds: 2 * 60
      },
      provisionerId: 'aws-provisioner',
      workerId: 'i-123456',
      workerType: 'ami-333333',
      workerNodeType: 'c3.xlarge',
      workerGroup: 'us-west-2',
      instanceId: 'i-123456',
      instanceType: 'c3.xlarge',
      region: 'us-west-2d',
      capacity: 1,
      publicIp: '22.33.44.252',
      billingCycleInterval: 120*60,
      privateIp: '169.254.1.2',
      restrictedProxy: {
        accessToken: 'xyz'
      },
      dockerConfig: {
        allowPrivileged: true,
        token: 'docker-token'
      },
      taskcluster: {
        clientId: config.taskcluster.clientId,
        accessToken: config.taskcluster.accessToken,
        certificate: config.taskcluster.certificate
      }
    });

    try {
      await provisioner.getSecret(data.token);
      assert.ok(false, 'Secrets should be removed after being consumed');
    }
    catch (e) {
      if (e.name === 'AssertionError') throw e;
      assert.equal(e.statusCode, 404);
    }
  });
});

