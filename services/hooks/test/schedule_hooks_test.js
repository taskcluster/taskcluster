const assert = require('assert');
const Scheduler = require('../src/scheduler');
const helper = require('./helper');
const libUrls = require('taskcluster-lib-urls');

suite('schedule_hooks_test.js', function() {
  suiteSetup(async function() {
    await helper.secrets.setup();
    helper.load.save();
    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
  });

  suiteTeardown(function() {
    helper.load.restore();
  });

  helper.withHook(true, () => false); // always mock, since this is a simple setup

  test('schedule_hooks launches a scheduler', async () => {
    const scheduler = await helper.load('schedulerNoStart');
    assert(scheduler instanceof Scheduler);
  });
});
