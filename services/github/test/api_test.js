/**
 * Tests of endpoints in the api _other than_
 * the github webhook endpoint which is tested
 * in webhook_test.js
 */
suite('api', () => {
  let helper = require('./helper');
  let assert = require('assert');

  test('builds', async function(done) {
    await helper.Builds.create({
      organization: 'abc123',
      repository: 'def456',
      sha: '7650871208002a13ba35cf232c0e30d2c3d64783',
      state: 'pending',
      taskGroupId: 'biizERCQQwi9ZS_WkCSjXQ',
      created: new Date(),
      updated: new Date(),
    });
    await helper.Builds.create({
      organization: 'ghi789',
      repository: 'jkl101112',
      sha: '8650871208002a13ba35cf232c0e30d2c3d64783',
      state: 'success',
      taskGroupId: 'aiizERCQQwi9ZS_WkCSjXQ',
      created: new Date(),
      updated: new Date(),
    });
    let builds = await helper.github.builds();
    try {
      assert.equal(builds.builds.length, 2);
      assert.equal(builds.builds[0].organization, 'abc123');
      assert.equal(builds.builds[1].organization, 'ghi789');
      done();
    } catch (e) {
      done(e);
    }
  });
});
