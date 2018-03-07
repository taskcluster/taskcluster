suite('bin/schedule-hooks.js', function() {
  var assert            = require('assert');
  var Scheduler         = require('../src/scheduler');
  var helper            = require('./helper');

  test('schedule_hooks launches a scheduler', async () => {
    var scheduler = await helper.load('schedulerNoStart', helper.loadOptions);
    assert(scheduler instanceof Scheduler);
  });
});
