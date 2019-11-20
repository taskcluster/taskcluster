const {defaultMonitorManager, LEVELS} = require('taskcluster-lib-monitor');

let monitorSetup = false;
module.exports = (helper, options = {}) => {
  // ensure that a single monitor instance is injected as soon as possible
  // (even before suite setups run), and only once.
  if (!options.noLoader && !monitorSetup) {
    helper.load.inject('monitor', defaultMonitorManager.setup({
      fake: true,
      debug: true,
      verify: true,
      level: 'debug',
    }));
    monitorSetup = true;
  }

  teardown(async function() {
    // any messages at the ERROR level of above should cause a test failure
    const errors = defaultMonitorManager.messages
      .filter(({Severity}) => Severity <= LEVELS.err);
    if (errors.length > 0) {
      throw new Error('Errors logged to monitor during test run:\n' +
        errors.map(msg => JSON.stringify(msg.Fields)).join('\n'));
    }

    // otherwise, delete all accumulated messages
    defaultMonitorManager.reset();
  });
};
