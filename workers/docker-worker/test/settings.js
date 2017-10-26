/**
The `test` host has a number of configuration options which are loaded from the
test/settings/ directory. This allows for testing complicated configuration
situations quickly (and either inside or outside a docker container).
*/

var fs = require('fs');
var fsPath = require('path');

var SETTINGS_DIR = __dirname + '/settings/';

function write(path, data) {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR);
  }
  fs.writeFileSync(settingsPath(path), data);
}

function unlink(path) {
  var fullPath = settingsPath(path);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

function settingsPath(path) {
  return fsPath.join(SETTINGS_DIR, path);
}

module.exports = {
  write,
  settingsPath,
  unlink,

  billingCycleInterval(seconds) {
    write('billingCycleInterval', seconds);
  },

  billingCycleUptime(seconds) {
    write('billingCycleUptime', seconds);
  },

  nodeTermination() {
    write('nodeTermination', 'terminated');
  },

  configure(config) {
    write('configure', JSON.stringify(config, null, 2));
  },

  // cleanup any settings files.
  cleanup() {
    unlink('billingCycleInterval');
    unlink('billingCycleUptime');
    unlink('nodeTermination');
    unlink('configure');
  }
}
