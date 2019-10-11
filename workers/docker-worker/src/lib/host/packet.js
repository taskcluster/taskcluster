/**
Return the appropriate configuration defaults when on packet.net.
*/

const got = require('got-promise');
const { createLogger } = require('../log');
const { spawn } = require('child_process');
const os = require('os');
const assert = require('assert');
const fs = require('fs');
const taskcluster = require('taskcluster-client');

const log = createLogger({
  source: 'host/packet'
});

function minutes(n) {
  return n * 60;
}

module.exports = {
  async configure() {
    try {
      const res = await got('https://metadata.packet.net/metadata');
      const data = JSON.parse(res.body);
      const publicIp = data.network.addresses
        .filter(addr => addr.address_family === 4 && addr.public)
        .map(addr => addr.address)[0];
      const privateIp = data.network.addresses
        .filter(addr => addr.address_family === 4 && !addr.public)
        .map(addr => addr.address)[0];

      assert(publicIp);
      assert(privateIp);


      // User data required fields:
      // * clientId - taskcluster client ID
      // * accessToken - taskcluster access token
      // * taskclusterRootUrl - root URL for taskcluster service
      // * provisionerId - the taskcluster provisioner ID
      // * worker type - the taskcluster worker type name
      // * capacity - the worker capacity
      // * allowPrivileged - boolean indicating if the instance is allowed to run privileged docker containers

      const userdata = fs.readFileSync('/var/lib/cloud/instance/user-data.txt')
        .toString()
        .split('\n')
        .map(line => line.slice(1).split('=')) // remove the '#' and split the assignment
        .filter(x => x.length === 2)
        .map(x => { return {[x[0]]: x[1]}; })
        .reduce((a, b) => Object.assign(a, b));

      // TODO get credentials through worker-manager
      let credentials = {
        clientId: userdata.clientId,
        accessToken: userdata.accessToken,
      };

      const secrets = new taskcluster.Secrets({
        rootUrl: userdata.taskclusterRootUrl,
        credentials,
      });

      let secretsData;
      try {
        secretsData = await secrets.get(
          `worker-type:${userdata.provisionerId}/${userdata.workerType}`
        );
      } catch (err) {
        log(err);
        secretsData = {
          secret: {},
        };
      }

      const config = {
        taskcluster: credentials,
        rootUrl: userdata.taskclusterRootUrl,
        host: data.hostname,
        publicIp,
        privateIp,
        workerNodeType: 'packet.net',
        instanceId: data.id,
        workerId: data.id,
        workerGroup: data.facility,
        provisionerId: userdata.provisionerId,
        region: data.facility,
        instanceType: data.plan,
        capacity: parseInt(userdata.capacity) || 1,
        workerType: userdata.workerType,
        shutdown: {
          enabled: true,
          afterIdleSeconds: minutes(60),
        },
        dockerConfig: {
          allowPrivileged: userdata.allowPrivileged == 'true',
        },
        logging: {
          secureLiveLogging: false,
        },
      };
      return Object.assign(config, secretsData.secret);
    } catch (e) {
      log('[alert-operator] error retrieving secrets', {stack: e.stack});
      spawn('shutdown', ['-h', 'now']);
    }
  },
  getTerminationTime() {
    return false;
  },
  billingCycleUptime() {
    return os.uptime();
  },
};
