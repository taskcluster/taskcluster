suite('bin/schedule-hooks.js', () => {
  var assert            = require('assert');
  var assume            = require('assume');
  var schedule_hooks    = require('../bin/schedule-hooks');
  var Scheduler         = require('../hooks/scheduler');
  var debug             = require('debug')('test:test_schedule_hooks');

  var scheduler = null;

  teardown(async () => {
    if (scheduler) {
      await scheduler.terminate();
    }
    scheduler = null;
  });

  test('schedule_hooks launches a scheduler', async () => {
    scheduler = await schedule_hooks('test');
  });
});
