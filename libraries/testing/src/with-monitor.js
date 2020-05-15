const {MonitorManager, LEVELS} = require('taskcluster-lib-monitor');

let monitor;
module.exports = (helper, options = {}) => {
  // ensure that a single monitor instance is injected as soon as possible
  // (even before suite setups run), and only once.
  if (!options.noLoader && !monitor) {
    monitor = MonitorManager.setup({
      serviceName: 'test',
      fake: true,
      debug: true,
      verify: true,
      level: 'debug',
    });
    helper.load.inject('monitor', monitor);
  }

  teardown(async function() {
    // any messages at the ERROR level of above should cause a test failure
    if (monitor) {
      const errors = monitor.manager.messages
        .filter(({Severity}) => Severity <= LEVELS.err);
      if (errors.length > 0) {
        throw new Error('Errors logged to monitor during test run:\n' +
          errors.map(msg => JSON.stringify(msg.Fields)).join('\n'));
      }

      // otherwise, delete all accumulated messages
      monitor.manager.reset();
    }
  });
};
