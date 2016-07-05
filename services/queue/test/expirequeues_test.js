suite('Task Expiration (expire-tasks)', () => {
  var debug       = require('debug')('test:expireTasks');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var assume      = require('assume');
  var helper      = require('./helper');

  // test functionality elsewhere, here we just test that it can actually run
  test('expire-queues runs without bugs', async () => {
    // We don't care if we delete any queues. In fact we won't delete queues
    // used in testing because they have up-to-date meta-data. Also if we did
    // they would be in state queue-being-deleted (so tests would fail)
    debug('### Expire queues (don\'t care if delete any)');
    await helper.expireQueues();
  });
});
