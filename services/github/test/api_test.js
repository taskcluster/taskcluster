const helper = require('./helper');
const assert = require('assert');
const _ = require('lodash');
const got = require('got');
const testing = require('taskcluster-lib-testing');

/**
 * Tests of endpoints in the api _other than_
 * the github webhook endpoint which is tested
 * in webhook_test.js
 */
helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await helper.db.fns.create_github_build(
      'abc123',
      'def456',
      '7650871208002a13ba35cf232c0e30d2c3d64783',
      'biizERCQQwi9ZS_WkCSjXQ',
      'pending',
      new Date(),
      new Date(),
      1,
      'push',
      '26370a80-ed65-11e6-8f4c-80082678482d',
    );
    await helper.db.fns.create_github_build(
      'ghi789',
      'jkl101112',
      '8650871208002a13ba35cf232c0e30d2c3d64783',
      'aiizERCQQwi9ZS_WkCSjXQ',
      'success',
      new Date(),
      new Date(),
      1,
      'push',
      '26370a80-ed65-11e6-8f4c-80082678482d',
    );
    await helper.db.fns.create_github_build(
      'abc123',
      'xyz',
      'x650871208002a13ba35cf232c0e30d2c3d64783',
      'qiizERCQQwi9ZS_WkCSjXQ',
      'pending',
      new Date(),
      new Date(),
      1,
      'push',
      '26370a80-ed65-11e6-8f4c-80082678482d',
    );
    await helper.db.fns.create_github_build(
      'abc123',
      'xyz',
      'y650871208002a13ba35cf232c0e30d2c3d64783',
      'ziizERCQQwi9ZS_WkCSjXQ',
      'pending',
      new Date(),
      new Date(),
      1,
      'push',
      'Unknown',
    );

    await helper.db.fns.upsert_github_integration(
      'abc123',
      9090,
    );

    await helper.db.fns.upsert_github_integration(
      'qwerty',
      9091,
    );
  });

  let github;

  setup(async function() {
    github = await helper.load('github');
    github.inst(9090).setRepositories('coolRepo', 'anotherCoolRepo', 'awesomeRepo', 'nonTCGHRepo', 'checksRepo');
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'coolRepo',
      ref: 'master',
      info: [{ creator: { id: 12345 }, state: 'success' }, { creator: { id: 55555 }, state: 'failure' }],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'awesomeRepo',
      ref: 'master',
      info: [
        { creator: { id: 12345 }, state: 'success' },
        { creator: { id: 55555 }, state: 'success', target_url: 'Wonderland' },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'nonTCGHRepo',
      ref: 'master',
      info: [{ creator: { id: 123345 }, state: 'success' }],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'errorRepo',
      ref: 'master',
      info: { errorStatus: 499 },
    });
    github.inst(9090).setUser({ id: 55555, email: 'noreply@github.com', username: 'magicalTCspirit[bot]' });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'checksRepo',
      ref: 'success',
      info: [
        { name: "check1", conclusion: 'success', app: { id: 66666 } },
        { name: "check2", conclusion: 'success', app: { id: 66666 } },
        { name: "check3", conclusion: 'failure', app: { id: 12345 } },
      ],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'checksRepo',
      ref: 'failure',
      info: [
        { name: "check1", conclusion: 'success', app: { id: 66666 } },
        { name: "check2", conclusion: 'failure', app: { id: 66666 } },
      ],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'checksRepo',
      ref: 'pending',
      info: [
        { name: "check1", conclusion: 'success', app: { id: 66666 } },
        { name: "check2", conclusion: 'pending', app: { id: 66666 } },
        { name: "check3", conclusion: 'failure', app: { id: 12345 } },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'checksRepo',
      ref: 'combined',
      info: [
        { creator: { id: 12345 }, state: 'success' },
        { creator: { id: 55555 }, state: 'success', target_url: 'Wonderland' },
      ],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'checksRepo',
      ref: 'combined',
      info: [
        { name: "check1", conclusion: 'success', app: { id: 66666 } },
        { name: "check2", conclusion: 'failure', app: { id: 66666 } },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'checksRepo',
      ref: 'combined2',
      info: [
        { creator: { id: 12345 }, state: 'success' },
        { creator: { id: 55555 }, state: 'failure', target_url: 'Wonderland' },
      ],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'checksRepo',
      ref: 'combined2',
      info: [
        { name: "check1", conclusion: 'success', app: { id: 66666 } },
      ],
    });
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

  test('all builds without scopes', async function() {
    const client = new helper.GithubClient({ rootUrl: helper.rootUrl });
    await assert.rejects(
      () => client.builds(),
      err => err.code === 'InsufficientScopes');
  });

  test('org builds', async function() {
    let builds = await helper.apiClient.builds({ organization: 'abc123' });
    assert.equal(builds.builds.length, 3);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
  });

  test('repo builds', async function() {
    let builds = await helper.apiClient.builds({ organization: 'abc123', repository: 'xyz' });
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

  test('builds invalid queries are rejected', async function() {
    await assert.rejects(async () => {
      await helper.apiClient.builds({
        repository: 'xyz',
        sha: 'y650871208002a13ba35cf232c0e30d2c3d64783',
      });
    }, /Error: Must provide/);
    await assert.rejects(async () => {
      await helper.apiClient.builds({
        repository: 'xyz',
        sha: 'y650871208002a13ba35cf232c0e30d2c3d64783',
      });
    }, /Error: Must provide/);
  });

  test('integration installation', async function() {
    let result = await helper.apiClient.repository('abc123', 'coolRepo');
    assert.deepEqual(result, { installed: true });
    result = await helper.apiClient.repository('abc123', 'unknownRepo');
    assert.deepEqual(result, { installed: false });
    result = await helper.apiClient.repository('unknownOwner', 'unknownRepo');
    assert.deepEqual(result, { installed: false });
  });

  test('repository() without scopes', async function() {
    const client = new helper.GithubClient({ rootUrl: helper.rootUrl });
    await assert.rejects(
      () => client.repository('a', 'b'),
      err => err.code === 'InsufficientScopes');
  });

  test('build badges - status:failure', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'coolRepo', 'master'));
      assert.equal(res.headers['content-length'], 8615);
    });
  });

  test('build badges - status:failure (checks API)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'failure'));
      assert.equal(res.headers['content-length'], 8615);
    });
  });

  test('build badges - status:failure (combined status and checks)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'combined'));
      assert.equal(res.headers['content-length'], 8615);
    });
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'combined2'));
      assert.equal(res.headers['content-length'], 8615);
    });
  });

  test('build badges - status: success', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'awesomeRepo', 'master'));
      assert.equal(res.headers['content-length'], 9189);
    });
  });

  test('build badges - status: success (checks API)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'success'));
      assert.equal(res.headers['content-length'], 9189);
    });
  });

  test('build badges - status: pending (checks API)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'pending'));
      assert.equal(res.headers['content-length'], 11435);
    });
  });

  test('build badges - error', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'errorRepo', 'master'));
      assert.equal(res.headers['content-length'], 4268);
    });
  });

  test('build badges - no such status', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'unknownRepo', 'master'));
      assert.equal(res.headers['content-length'], 7873);
    });
  });

  test('build badges - new repo (no info yet)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'nonTCGHRepo', 'master'));
      assert.equal(res.headers['content-length'], 7873);
    });
  });

  test('build badges without scopes', async function() {
    const client = new helper.GithubClient({ rootUrl: helper.rootUrl });
    await assert.rejects(
      () => client.badge('a', 'b', 'c'),
      err => err.code === 'InsufficientScopes');
  });

  test('link for clickable badges', async function() {
    let res;

    await testing.fakeauth.withAnonymousScopes(['github:latest-status:abc123:*'], async () => {
      // check if the function returns a correct link
      try {
        res = await got(
          helper.apiClient.buildUrl(helper.apiClient.latest, 'abc123', 'awesomeRepo', 'master'),
          { followRedirect: false });
      } catch (e) {
        console.log(`Test for redirecting to correct page failed. Error: ${JSON.stringify(e)}`);
      }
      assert.equal(res.body, 'Found. Redirecting to Wonderland');
    });
  });

  test('link for clickable badges when no such thing exists', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:latest-status:abc123:*'], async () => {
      await assert.rejects(() => got(
        helper.apiClient.buildUrl(helper.apiClient.latest, 'abc123', 'unknownRepo', 'nosuch'),
        { followRedirect: false }), err => err.response.statusCode === 404);
    });
  });

  test('latest link without scopes', async function() {
    const client = new helper.GithubClient({ rootUrl: helper.rootUrl });
    await assert.rejects(
      () => client.latest('a', 'b', 'c'),
      err => err.code === 'InsufficientScopes');
  });

  test('simple status creation', async function() {
    await helper.apiClient.createStatus('abc123', 'awesomeRepo', 'master', {
      state: 'error',
    });

    let status = github.inst(9090).listCommitStatusesForRef({
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

    let status = github.inst(9090).listCommitStatusesForRef({
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
      await helper.apiClient.createComment('abc123', 'no-permission', 1, { body: 'x' });
    } catch (e) {
      assert.equal(e.statusCode, 403);
      return; // passed
    }
    throw new Error('endpoint should have failed');
  });
});
