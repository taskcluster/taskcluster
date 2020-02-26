const fs = require('fs');
const os = require('os');
const {StreamTransport, Protocol} = require('../worker-runner-protocol');

// This module is imported as an "object", so the only place we have to store
// persistent state is as module-level globals.
let protocol;
let gracefulTermination = false;

module.exports = {
  setup() {
    const transp = new StreamTransport(process.stdin, process.stdout);
    protocol = new Protocol(transp);

    // docker-worker doesn't support a finish-your-tasks-first termination,
    // so we ignore that portion of the message
    protocol.addCapability('graceful-termination');
    protocol.addCapability('shutdown');
    protocol.on('graceful-termination-msg', () => {
      gracefulTermination = true;
    });

    protocol.start();
  },

  billingCycleUptime() {
    return os.uptime();
  },

  getTerminationTime() {
    // This method name would make you think it returns a time, but it really just
    // returns a boolean.
    return gracefulTermination;
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
};
