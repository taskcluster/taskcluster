/**
 * Tests of installation syncing
 */
suite('syncInstallations', () => {
  let helper = require('./helper');
  let assert = require('assert');
  let _ = require('lodash');

  suiteSetup(async () => {
    await helper.OwnersDirectory.scan({}, {
      handler: owner => owner.remove(),
    });
  });

  test('integration installation', async function() {
    let result = await helper.github.repository('abc123', 'coolRepo');
    assert.deepEqual(result, {installed: false});
    helper.fakeGithub.createInstall(12345, 'abc123', ['coolRepo']);
    helper.fakeGithub.createInstall(12346, 'abc124', ['coolerRepo']);
    helper.fakeGithub.createInstall(12347, 'abc125', ['coolestRepo']);
    await helper.syncInstallations();
    result = await helper.github.repository('abc123', 'coolRepo');
    result = await helper.github.repository('abc124', 'coolerRepo');
    result = await helper.github.repository('abc125', 'coolestRepo');
    assert.deepEqual(result, {installed: true});
  });
});
