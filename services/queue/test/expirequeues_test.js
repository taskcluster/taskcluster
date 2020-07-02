const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withQueueService(mock, skipping);

  // test functionality elsewhere, here we just test that it can actually run
  test('expire-queue-messages runs without bugs', async () => {
    await helper.runExpiration('expire-queue-messages');
  });
});
