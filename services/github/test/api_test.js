const helper = require('./helper');
const assert = require('assert');
const _ = require('lodash');
const got = require('got');

/**
 * Tests of endpoints in the api _other than_
 * the github webhook endpoint which is tested
 * in webhook_test.js
 */
helper.secrets.mockSuite('api_test.js', ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withServer(mock, skipping);

  suiteSetup(async function() {
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

    await helper.OwnersDirectory.create({
      installationId: 9090,
      owner: 'abc123',
    });

    await helper.OwnersDirectory.create({
      installationId: 9091,
      owner: 'qwerty',
    });
  });

  setup(async function() {
    github = await helper.load('github');
    github.inst(9090).setRepositories('coolRepo', 'anotherCoolRepo', 'awesomeRepo', 'nonTCGHRepo');
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'coolRepo',
      ref: 'master',
      info: [{creator: {id: 12345}, state: 'success'}, {creator: {id: 55555}, state: 'failure'}],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'awesomeRepo',
      ref: 'master',
      info: [
        {creator: {id: 12345}, state: 'success'},
        {creator: {id: 55555}, state: 'success', target_url: 'Wonderland'},
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'nonTCGHRepo',
      ref: 'master',
      info: [{creator: {id: 123345}, state: 'success'}],
    });
    github.inst(9090).setUser({id: 55555, email: 'noreply@github.com', username: 'magicalTCspirit'});
  });

  test('all builds', async function() {
    let builds = await helper.apiClient.builds();
    assert.equal(builds.builds.length, 4);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[1].organization, 'abc123');
    assert.equal(builds.builds[2].organization, 'abc123');
    assert.equal(builds.builds[3].organization, 'ghi789');
  });

  test('org builds', async function() {
    let builds = await helper.apiClient.builds({organization: 'abc123'});
    assert.equal(builds.builds.length, 3);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
  });

  test('repo builds', async function() {
    let builds = await helper.apiClient.builds({organization: 'abc123', repository: 'xyz'});
    assert.equal(builds.builds.length, 2);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[0].repository, 'xyz');
  });

  test('sha builds', async function() {
    let builds = await helper.apiClient.builds({
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

  test('integration installation', async function() {
    let result = await helper.apiClient.repository('abc123', 'coolRepo');
    assert.deepEqual(result, {installed: true});
    result = await helper.apiClient.repository('abc123', 'unknownRepo');
    assert.deepEqual(result, {installed: false});
    result = await helper.apiClient.repository('unknownOwner', 'unknownRepo');
    assert.deepEqual(result, {installed: false});
  });

  test('build badges', async function() {
    var res;

    // status: failure
    res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'coolRepo', 'master'));
    assert.equal(res.headers['content-length'], 8615);

    // status: success
    res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'awesomeRepo', 'master'));
    assert.equal(res.headers['content-length'], 9189);

    // error
    res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'unknownRepo', 'master'));
    assert.equal(res.headers['content-length'], 4268);

    // new repo (no info yet)
    res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'nonTCGHRepo', 'master'));
    assert.equal(res.headers['content-length'], 7873);
  });

  test('link for clickable badges', async function() {
    var res;

    // check if the function returns a correct link
    try {
      res = await got(
        helper.apiClient.buildUrl(helper.apiClient.latest, 'abc123', 'awesomeRepo', 'master'),
        {followRedirect: false});
    } catch (e) {
      console.log(`Test for redirecting to correct page failed. Error: ${JSON.stringify(e)}`);
    }
    assert.equal(res.body, 'Found. Redirecting to Wonderland');
  });

  test('simple status creation', async function() {
    await helper.apiClient.createStatus('abc123', 'awesomeRepo', 'master', {
      state: 'error',
    });

    let status = github.inst(9090).listStatusesForRef({
      owner: 'abc123',
      repo: 'awesomeRepo',
      ref: 'master',
    }).data.pop();
    assert.equal(status.state, 'error');
    assert.equal(status.target_url, undefined);
    assert.equal(status.description, undefined);
    assert.equal(status.context, 'default');
  });

  test('advanced status creation', async function() {
    await helper.apiClient.createStatus('abc123', 'awesomeRepo', 'master', {
      state: 'failure',
      target_url: 'http://test.com',
      description: 'Status title',
      context: 'customContext',
    });

    let status = github.inst(9090).listStatusesForRef({
      owner: 'abc123',
      repo: 'awesomeRepo',
      ref: 'master',
    }).data.pop();
    assert.equal(status.state, 'failure');
    assert.equal(status.target_url, 'http://test.com');
    assert.equal(status.description, 'Status title');
    assert.equal(status.context, 'customContext');
  });

  test('status creation where integraiton lacks permission', async function() {
    try {
      await helper.apiClient.createStatus('abc123', 'no-permission', 'master', {
        state: 'failure',
        target_url: 'http://test.com',
        description: 'Status title',
        context: 'customContext',
      });
    } catch (e) {
      assert.equal(e.statusCode, 403);
      return; // passed
    }
    throw new Error('endpoint should have failed');
  });
  test('pull request comment', async function() {
    await helper.apiClient.createComment('abc123', 'awesomeRepo', 1, {
      body: 'Task failed here',
    });

    let comment = github.inst(9090).getComments({
      owner: 'abc123',
      repo: 'awesomeRepo',
      number: 1,
    }).data.pop();
    assert.equal(comment.body, 'Task failed here');
  });

  test('pull request comment where integration lacks permission', async function() {
    try {
      await helper.apiClient.createComment('abc123', 'no-permission', 1, {body: 'x'});
    } catch (e) {
      assert.equal(e.statusCode, 403);
      return; // passed
    }
    throw new Error('endpoint should have failed');
  });
});
