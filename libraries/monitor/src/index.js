const MonitorManager = require('./monitormanager.js');
const {LEVELS} = require('./logger');
const {registerBuiltins} = require('./builtins');

const defaultMonitorManager = new MonitorManager();
registerBuiltins(defaultMonitorManager);

module.exports = {
  defaultMonitorManager,
  LEVELS,
};
