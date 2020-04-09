const assert = require('assert');
const Scheduler = require('../src/scheduler');
const helper = require('./helper');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);

  suiteSetup(async function() {
    await helper.secrets.setup();
    helper.load.save();
    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
  });

  suiteTeardown(function() {
    helper.load.restore();
  });

  test('schedule_hooks launches a scheduler', async () => {
    const scheduler = await helper.load('schedulerNoStart');
    assert(scheduler instanceof Scheduler);
  });
});
