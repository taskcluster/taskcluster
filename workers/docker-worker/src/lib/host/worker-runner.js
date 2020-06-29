const fs = require('fs');
const os = require('os');
const {StreamTransport, Protocol} = require('../worker-runner-protocol');

// This module is imported as an "object", so the only place we have to store
// persistent state is as module-level globals.
let protocol;
let newCredentialsCallback = null;
let gracefulTerminationCallback = null;

module.exports = {
  setup() {
    const transp = new StreamTransport(process.stdin, process.stdout);
    protocol = new Protocol(transp);

    protocol.addCapability('graceful-termination');
    protocol.on('graceful-termination-msg', msg => {
      if (gracefulTerminationCallback) {
        gracefulTerminationCallback(msg['finish-tasks']);
      }
    });

    protocol.addCapability('shutdown');

    protocol.addCapability('new-credentials');
    protocol.on('new-credentials-msg', msg => {
      if (newCredentialsCallback) {
        newCredentialsCallback({
          clientId: msg['client-id'],
          accessToken: msg['access-token'],
          certificate: msg['certificate'],
        });
      }
    });

    protocol.start();
  },

  billingCycleUptime() {
    return os.uptime();
  },

  configure() {
    const configFile = process.env.DOCKER_WORKER_CONFIG;
    if (!configFile || !fs.existsSync(configFile)) {
      throw new Error('No config file found');
    }
    const content = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(content);
  },

  async shutdown() {
    if (!await protocol.capable('shutdown')) {
      throw new Error('Shutdown called but worker-runner doesn\'t support this capability');
    }
    protocol.send({type: 'shutdown'});
  },

  async onNewCredentials(cb) {
    newCredentialsCallback = cb;
  },

  async onGracefulTermination(cb) {
    gracefulTerminationCallback = cb;
  },
};
