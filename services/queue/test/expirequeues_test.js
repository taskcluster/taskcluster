const debug = require('debug')('test:expireTasks');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');

helper.secrets.mockSuite(__filename, ['azure'], function(mock, skipping) {
  helper.withQueueService(mock, skipping);

  // test functionality elsewhere, here we just test that it can actually run
  test('expire-queues runs without bugs', async () => {
    // We don't care if we delete any queues. In fact we won't delete queues
    // used in testing because they have up-to-date meta-data. Also if we did
    // they would be in state queue-being-deleted (so tests would fail)
    await helper.runExpiration('expire-queues');
  });
});
