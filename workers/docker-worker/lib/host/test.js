var fs = require('fs');
var settingsPath = require('../../test/settings').settingsPath;
var debug = require('debug')('docker-worker:host:test');

function* billingCycleUptime() {
  var path = settingsPath('billingCycleUptime');

  try {
    return parseInt(fs.readFileSync(path), 10);
  } catch (e) {
    return 0;
  }
}
function* billingCycleInterval() {
  var path = settingsPath('billingCycleInterval');

  try {
    return parseInt(fs.readFileSync(path), 10);
  } catch(e) {
    return 0;
  }
}

function* getTerminationTime() {
  var path = settingsPath('nodeTermination');
  var content;
  try {
    content = fs.readFileSync(path, 'utf8');
  }
  catch (e) {
    content = '';
  }

  return content;
}

function* configure() {
  var path = settingsPath('configure');

  try {
    var content = fs.readFileSync(path, 'utf8');
    debug('configure read:', content);
    return JSON.parse(content)
  } catch (e) {
    return {};
  }
}

module.exports.configure = configure;
module.exports.billingCycleInterval = billingCycleInterval;
module.exports.billingCycleUptime = billingCycleUptime;
module.exports.getTerminationTime = getTerminationTime;
