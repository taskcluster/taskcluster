const assert = require('assert');
const Scheduler = require('../src/scheduler');
const helper = require('./helper');

suite('bin/schedule-hooks.js', function() {
  setup(function() {
    helper.load.save();
  });

  teardown(function() {
    helper.load.restore();
  });

  test('schedule_hooks launches a scheduler', async () => {
    const scheduler = await helper.load('schedulerNoStart');
    assert(scheduler instanceof Scheduler);
  });
});
