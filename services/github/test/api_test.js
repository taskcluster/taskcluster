/**
 * Tests of endpoints in the api _other than_
 * the github webhook endpoint which is tested
 * in webhook_test.js
 */
suite('api', () => {
  let helper = require('./helper');
  let assert = require('assert');

  suiteSetup(async () => {
    await helper.Builds.create({
      organization: 'abc123',
      repository: 'def456',
      sha: '7650871208002a13ba35cf232c0e30d2c3d64783',
      state: 'pending',
      taskGroupId: 'biizERCQQwi9ZS_WkCSjXQ',
      created: new Date(),
      updated: new Date(),
      installationId: 1,
    });
    await helper.Builds.create({
      organization: 'ghi789',
      repository: 'jkl101112',
      sha: '8650871208002a13ba35cf232c0e30d2c3d64783',
      state: 'success',
      taskGroupId: 'aiizERCQQwi9ZS_WkCSjXQ',
      created: new Date(),
      updated: new Date(),
      installationId: 1,
    });
    await helper.Builds.create({
      organization: 'abc123',
      repository: 'xyz',
      sha: 'x650871208002a13ba35cf232c0e30d2c3d64783',
      state: 'pending',
      taskGroupId: 'qiizERCQQwi9ZS_WkCSjXQ',
      created: new Date(),
      updated: new Date(),
      installationId: 1,
    });
    await helper.Builds.create({
      organization: 'abc123',
      repository: 'xyz',
      sha: 'y650871208002a13ba35cf232c0e30d2c3d64783',
      state: 'pending',
      taskGroupId: 'ziizERCQQwi9ZS_WkCSjXQ',
      created: new Date(),
      updated: new Date(),
      installationId: 1,
    });
  });

  test('all builds', async function() {
    let builds = await helper.github.builds();
    assert.equal(builds.builds.length, 4);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[1].organization, 'ghi789');
  });

  test('org builds', async function() {
    let builds = await helper.github.builds({organization: 'abc123'});
    assert.equal(builds.builds.length, 3);
    assert.equal(builds.builds[0].organization, 'abc123');
  });

  test('repo builds', async function() {
    let builds = await helper.github.builds({organization: 'abc123', repository: 'xyz'});
    assert.equal(builds.builds.length, 2);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[0].repository, 'xyz');
  });

  test('sha builds', async function() {
    let builds = await helper.github.builds({
      organization: 'abc123',
      repository: 'xyz',
      sha: 'y650871208002a13ba35cf232c0e30d2c3d64783',
    });
    assert.equal(builds.builds.length, 1);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[0].repository, 'xyz');
    assert.equal(builds.builds[0].sha, 'y650871208002a13ba35cf232c0e30d2c3d64783');
  });
});
