/**
The `test` host has a number of configuration options which are loaded from the
test/settings/ directory. This allows for testing complicated configuration
situations quickly (and either inside or outside a docker container).
*/

var fs = require('fs');
var fsPath = require('path');

var SETTINGS_DIR = __dirname + '/settings/';

function settingsPath(path) {
  return fsPath.join(SETTINGS_DIR, path);
}

function write(path, data) {
  fs.writeFileSync(settingsPath(path), data);
}

function unlink(path) {
  var fullPath = settingsPath(path);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

function billingCycleInterval(seconds) {
  write('billingCycleInterval', seconds);
}

function billingCycleUptime(seconds) {
  write('billingCycleUptime', seconds);
}

function nodeTermination() {
  write('nodeTermination', 'terminated');
}

function configure(config) {
  write('configure', JSON.stringify(config, null, 2));
}

// cleanup any settings files.
function cleanup() {
  unlink('billingCycleInterval');
  unlink('billingCycleUptime');
  unlink('nodeTermination');
  unlink('configure');
}

module.exports.settingsPath = settingsPath;
module.exports.cleanup = cleanup;
module.exports.configure = configure;
module.exports.billingCycleUptime = billingCycleUptime;
module.exports.billingCycleInterval = billingCycleInterval;
module.exports.nodeTermination = nodeTermination;
