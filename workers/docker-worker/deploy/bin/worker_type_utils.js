const tc = require('taskcluster-client');
const promiseRetry = require('promise-retry');
const AWS = require('aws-sdk');
const _ = require('lodash');
const amis = _.flatten(_.map(
  require('../../docker-worker-amis.json'),
  v => _.map(v)
));

class WorkerType {
  constructor(client, name) {
    this.client = client;
    this.name = name;
    this.retryOptions = {
      retries: 3,
      minTimeout: 2000,
      randomize: true
    };
  }

  workerType() {
    return promiseRetry(
      retry => this.client.workerType(this.name).catch(retry),
      this.retryOptions
    );
  }

  state() {
    return promiseRetry(
      retry => this.client.state(this.name).catch(retry),
      this.retryOptions
    );
  }

  update(wt) {
    const workerType = JSON.parse(JSON.stringify(wt));
    delete workerType.workerType;
    delete workerType.lastModified;

    return promiseRetry(
      retry => this.client.updateWorkerType(this.name, workerType).catch(retry),
      this.retryOptions
    );
  }
}

module.exports = {
  WorkerType: WorkerType,

  createClient() {
    return new tc.AwsProvisioner({
      credentials: {
        clientId: process.env.TASKCLUSTER_CLIENT_ID,
        accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN
      },
      baseUrl: 'https://aws-provisioner.taskcluster.net/v1'
    });
  },

  killInstances(workerType) {
    return workerType.state().then(state => {
      return Promise.all(_.map(
        // The filter call here is only to kill instances running
        // the AMIs we are rolling back
        _.groupBy(state.instances.filter(i => amis.includes(i.ami)), 'region'),
        (instances, region) => {
          const ec2 = new AWS.EC2({ region });
          return ec2.terminateInstances({
            InstanceIds: instances.map(i => i.id),
            DryRun: false
          }).promise();
        }
      ));
    });
  }
};

