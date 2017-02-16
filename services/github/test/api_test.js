/**
 * Tests of endpoints in the api _other than_
 * the github webhook endpoint which is tested
 * in webhook_test.js
 */
suite('api', () => {
  let helper = require('./helper');
  let assert = require('assert');
  let _ = require('lodash');

  suiteSetup(async () => {
    await helper.Builds.scan({}, {
      handler: build => build.remove(),
    });

    await helper.Builds.create({
      organization: 'abc123',
      repository: 'def456',
      sha: '7650871208002a13ba35cf232c0e30d2c3d64783',
      state: 'pending',
      taskGroupId: 'biizERCQQwi9ZS_WkCSjXQ',
      created: new Date(),
      updated: new Date(),
      installationId: 1,
      eventType: 'push',
      eventId: '26370a80-ed65-11e6-8f4c-80082678482d',
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
      eventType: 'push',
      eventId: '26370a80-ed65-11e6-8f4c-80082678482d',
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
      eventType: 'push',
      eventId: '26370a80-ed65-11e6-8f4c-80082678482d',
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
      eventType: 'push',
      eventId: 'Unknown',
    });
  });

  test('all builds', async function() {
    let builds = await helper.github.builds();
    assert.equal(builds.builds.length, 4);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[1].organization, 'abc123');
    assert.equal(builds.builds[2].organization, 'abc123');
    assert.equal(builds.builds[3].organization, 'ghi789');
  });

  test('org builds', async function() {
    let builds = await helper.github.builds({organization: 'abc123'});
    assert.equal(builds.builds.length, 3);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
  });

  test('repo builds', async function() {
    let builds = await helper.github.builds({organization: 'abc123', repository: 'xyz'});
    assert.equal(builds.builds.length, 2);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
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
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[0].repository, 'xyz');
    assert.equal(builds.builds[0].sha, 'y650871208002a13ba35cf232c0e30d2c3d64783');
  });
});
