/**
Return the appropriate configuration defaults when on packet.net.
*/

const Debug = require('debug');
const got = require('got-promise');
const { createLogger } = require('../log');
const { spawn } = require('child_process');
const os = require('os');
const assert = require('assert');
const fs = require('fs');
const taskcluster = require('taskcluster-client');

const debug = Debug('docker-worker:host:packet');

const log = createLogger({
  source: 'host/packet'
});

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

      const userdata = fs.readFileSync('/var/lib/cloud/instance/user-data.txt')
        .toString()
        .split('\n')
        .map(line => line.slice(1).split('=')) // remove the '#' and split the assignment
        .filter(x => x.length === 2)
        .map(x => { return {[x[0]]: x[1]}; })
        .reduce((a, b) => Object.assign(a, b));

      // TODO get credentials through worker-manager
      let credentials = {
        clientId: userdata.TASKCLUSTER_CLIENT_ID,
        accessToken: userdata.TASKCLUSTER_ACCESS_TOKEN,
      };

      const secrets = new taskcluster.Secrets({
        rootUrl: userdata.rootUrl,
        credentials,
      });

      const secretsData = await secrets.get(userdata.secretsPath);

      const config = {
        taskcluster: credentials,
        rootUrl: userdata.rootUrl,
        host: data.hostname,
        publicIp,
        privateIp,
        workerNodeType: 'packet.net',
        instanceId: data.id,
        workerId: userdata.workerId,
        workerGroup: userdata.workerGroup,
        provisionerId: userdata.provisionerId,
        region: data.facility,
        instanceType: data.plan,
        capacity: parseInt(userdata.capacity),
        workerType: userdata.workerType,
        shutdown: {
          enabled: true,
          afterIdleSeconds: 100 * 60 * 60, // 100 hours
        },
        dockerConfig: {
          allowPrivileged: true,
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
