const fs = require('fs');
const { settingsPath } = require('../../../test/settings');
const Debug = require('debug');

let debug = Debug('docker-worker:host:test');

function billingCycleUptime() {
  let path = settingsPath('billingCycleUptime');

  try {
    return parseInt(fs.readFileSync(path), 10);
  } catch (e) {
    return 0;
  }
}

module.exports = {
  billingCycleUptime,

  getTerminationTime() {
    let path = settingsPath('nodeTermination');
    let content;
    try {
      content = fs.readFileSync(path, 'utf8');
    }
    catch (e) {
      content = '';
    }

    return content;
  },

  configure() {
    let path = settingsPath('configure');
    let config = {
      publicIp: '127.0.0.1',
      privateIp: '169.254.1.1',
      workerNodeType: 'test-worker',
      instanceId: 'test-worker-instance',
      region: 'us-middle-1a',
      instanceType: 'r3-superlarge'
    };
    try {
      let content = fs.readFileSync(path, 'utf8');
      debug('configure read:', content);
      content = JSON.parse(content);
      Object.assign(config, content);
      return config;
    } catch (e) {
      return config;
    }
  }
};
