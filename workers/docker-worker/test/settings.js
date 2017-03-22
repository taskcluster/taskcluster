/**
The `test` host has a number of configuration options which are loaded from the
test/settings/ directory. This allows for testing complicated configuration
situations quickly (and either inside or outside a docker container).
*/

var fs = require('fs');
var fsPath = require('path');

var SETTINGS_DIR = __dirname + '/settings/';

export function settingsPath(path) {
  return fsPath.join(SETTINGS_DIR, path);
}

export function write(path, data) {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR);
  }
  fs.writeFileSync(settingsPath(path), data);
}

export function unlink(path) {
  var fullPath = settingsPath(path);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

export function billingCycleInterval(seconds) {
  write('billingCycleInterval', seconds);
}

export function billingCycleUptime(seconds) {
  write('billingCycleUptime', seconds);
}

export function nodeTermination() {
  write('nodeTermination', 'terminated');
}

export function configure(config) {
  write('configure', JSON.stringify(config, null, 2));
}

// cleanup any settings files.
export function cleanup() {
  unlink('billingCycleInterval');
  unlink('billingCycleUptime');
  unlink('nodeTermination');
  unlink('configure');
}
