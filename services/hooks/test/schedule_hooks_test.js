import assert from 'node:assert';
import Scheduler from '../src/scheduler.js';
import helper from './helper.js';
import libUrls from 'taskcluster-lib-urls';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.resetTables();

  suiteSetup(async () => {
    await helper.load('cfg');
    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
  });

  test('schedule_hooks launches a scheduler', async () => {
    const scheduler = await helper.load('schedulerNoStart');
    assert(scheduler instanceof Scheduler);
  });
});
