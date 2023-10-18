import helper from './helper.js';
import assert from 'assert';
import testing from 'taskcluster-lib-testing';

/**
 * Tests of installation syncing
 */
helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  let github;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    github = await helper.load('github');
  });

  test('integration installation', async function() {
    let result = await helper.apiClient.repository('abc123', 'coolRepo');
    assert.deepEqual(result, { installed: false });
    github.createInstall(12345, 'abc123', ['coolRepo']);
    github.createInstall(12346, 'abc124', ['coolerRepo']);
    github.createInstall(12347, 'abc125', ['coolestRepo']);

    await helper.load('syncInstallations');

    result = await helper.apiClient.repository('abc123', 'coolRepo');
    result = await helper.apiClient.repository('abc124', 'coolerRepo');
    result = await helper.apiClient.repository('abc125', 'coolestRepo');
    assert.deepEqual(result, { installed: true });
  });
});
