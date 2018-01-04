suite('bin/schedule-hooks.js', function() {
  var assert            = require('assert');
  var Scheduler         = require('../src/scheduler');
  var helper            = require('./helper');

  // these tests require Azure credentials (for the Hooks table)
  if (!helper.haveRealCredentials) {
    this.pending = true;
  }

  test('schedule_hooks launches a scheduler', async () => {
    var scheduler = await helper.load('schedulerNoStart', helper.loadOptions);
    assert(scheduler instanceof Scheduler);
  });
});
