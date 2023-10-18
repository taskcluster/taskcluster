import helper from './helper.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);

  // test functionality elsewhere, here we just test that it can actually run
  test('expire-queue-messages runs without bugs', async () => {
    await helper.runExpiration('expire-queue-messages');
  });
});
