const MonitorManager = require('./monitor/monitormanager.js');
const {LEVELS} = require('./monitor/logger');
const {registerBuiltins} = require('./monitor/builtins');

const defaultMonitorManager = new MonitorManager();
registerBuiltins(defaultMonitorManager);

module.exports = {
  defaultMonitorManager,
  LEVELS,
};
