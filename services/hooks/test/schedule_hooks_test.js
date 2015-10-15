suite('bin/schedule-hooks.js', function() {
  var assert            = require('assert');
  var schedule_hooks    = require('../bin/schedule-hooks');
  var Scheduler         = require('../hooks/scheduler');
  var helper            = require('./helper');

  // these tests require Azure credentials (for the Hooks table)
  if (!helper.hasAzureCredentials) {
    this.pending = true;
  }

  test('schedule_hooks launches a scheduler', async () => {
    var scheduler = await schedule_hooks('test', {noStart: true});
    assert(scheduler instanceof Scheduler);
  });
});
