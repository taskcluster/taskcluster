import helper from './helper.js';
import assert from 'assert';
import _ from 'lodash';
import got from 'got';
import testing from '@taskcluster/lib-testing';

/**
 * Tests of endpoints in the api _other than_
 * the github webhook endpoint which is tested
 * in webhook_test.js
 */
helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await helper.db.fns.create_github_build_pr(
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
      null,
    );
    await helper.db.fns.create_github_build_pr(
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
      1,
    );
    await helper.db.fns.create_github_build_pr(
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
      null,
    );
    await helper.db.fns.create_github_build_pr(
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
      2,
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
    github.inst(9090).setRepositories('coolRepo', 'anotherCoolRepo', 'awesomeRepo', 'nonTCGHRepo', 'checksRepo',
      'softStatusRepo');
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
        { id: 1, name: "check1", conclusion: 'failure', app: { id: 12345 }, html_url: "https://example.com/abc123/checksRepo/runs/1" },
        { id: 3, name: "check3", conclusion: 'success', app: { id: 66666 }, html_url: "https://example.com/abc123/checksRepo/runs/3" },
        { id: 2, name: "check2", conclusion: 'success', app: { id: 66666 }, html_url: "https://example.com/abc123/checksRepo/runs/2" },
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
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'timedout',
      info: [{ creator: { id: 123345 }, state: 'success' }],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'timedout',
      info: [
        { name: "check1", conclusion: 'timed_out', app: { id: 66666 } },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'cancelled',
      info: [{ creator: { id: 123345 }, state: 'success' }],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'cancelled',
      info: [
        { name: "check1", conclusion: 'cancelled', app: { id: 66666 } },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'skipped',
      info: [{ creator: { id: 123345 }, state: 'success' }],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'skipped',
      info: [
        { name: "check1", conclusion: 'skipped', app: { id: 66666 } },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'stale',
      info: [{ creator: { id: 123345 }, state: 'success' }],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'stale',
      info: [
        { name: "check1", conclusion: 'stale', app: { id: 66666 } },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'actionRequired',
      info: [{ creator: { id: 123345 }, state: 'success' }],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'actionRequired',
      info: [
        { name: "check1", conclusion: 'action_required', app: { id: 66666 } },
      ],
    });
    github.inst(9090).setStatuses({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'neutral',
      info: [{ creator: { id: 123345 }, state: 'success' }],
    });
    github.inst(9090).setChecks({
      owner: 'abc123',
      repo: 'softStatusRepo',
      ref: 'neutral',
      info: [
        { name: "check1", conclusion: 'neutral', app: { id: 66666 } },
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

  test('pull request builds', async function() {
    let builds = await helper.apiClient.builds({
      organization: 'abc123',
      repository: 'xyz',
      pullRequest: 2,
    });

    assert.equal(builds.builds.length, 1);
    builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
    assert.equal(builds.builds[0].organization, 'abc123');
    assert.equal(builds.builds[0].repository, 'xyz');
    assert.equal(builds.builds[0].pullRequestNumber, 2);
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

  suite('cancel builds', function() {
    setup(async function() {
      // reset build states
      const builds = await helper.db.fns.get_github_builds_pr(null, null, null, null, null, null);
      await Promise.all(builds.map(build => helper.db.fns.set_github_build_state(build.task_group_id, 'pending')));
    });
    test('nothing to cancel', async function () {
      await assert.rejects(async () => {
        await helper.apiClient.cancelBuilds('no-such-org', 'no-repo');
      }, /Error: No cancellable builds found/);
    });
    test('cancel running builds for repo', async function() {
      let builds = await helper.apiClient.cancelBuilds('abc123', 'xyz');
      assert.equal(builds.builds.length, 2);
      builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
      assert.equal(builds.builds[0].organization, 'abc123');
      assert.equal(builds.builds[0].repository, 'xyz');
      assert.equal(builds.builds[0].state, 'cancelled');
    });
    test('cancel running builds for PR', async function() {
      let builds = await helper.apiClient.cancelBuilds('abc123', 'xyz', { pullRequest: 2 });
      assert.equal(builds.builds.length, 1);
      builds.builds = _.orderBy(builds.builds, ['organization', 'repository']);
      assert.equal(builds.builds[0].organization, 'abc123');
      assert.equal(builds.builds[0].repository, 'xyz');
      assert.equal(builds.builds[0].state, 'cancelled');
    });
    test('cannot cancel twice same builds', async function() {
      let builds = await helper.apiClient.cancelBuilds('abc123', 'xyz', { pullRequest: 2 });
      assert.equal(builds.builds.length, 1);
      await assert.rejects(async () => {
        await helper.apiClient.cancelBuilds('no-such-org', 'no-repo');
      }, /Error: No cancellable builds found/);
    });
    test('no scopes', async function() {
      const noScopesClient = new helper.GithubClient({ rootUrl: helper.rootUrl });
      await assert.rejects(async () => {
        await noScopesClient.cancelBuilds('abc123', 'xyz');
      }, err => err.code === 'InsufficientScopes');
    });
    test('scopes: wrong org and repo', async function () {
      await testing.fakeauth.withAnonymousScopes(['github:cancel-builds:wrong-org:wrong-repo'], async () => {
        await assert.rejects(
          () => got.post(helper.apiClient.buildUrl(helper.apiClient.cancelBuilds, 'abc123', 'xyz')),
          err => err.response.statusCode === 403,
        );
      });
    });
    test('scopes: wrong repo', async function () {
      await testing.fakeauth.withAnonymousScopes(['github:cancel-builds:abc123:wrong-repo'], async () => {
        await assert.rejects(
          () => got.post(helper.apiClient.buildUrl(helper.apiClient.cancelBuilds, 'abc123', 'xyz', {})),
          err => err.response.statusCode === 403,
        );
      });
    });
    test('scopes: expand scopes works', async function () {
      await testing.fakeauth.withAnonymousScopes(['github:cancel-builds:abc123:*'], async () => {
        const builds = await got.post(
          helper.apiClient.buildUrl(helper.apiClient.cancelBuilds, 'abc123', 'xyz'),
          { responseType: 'json' },
        );
        assert.equal(builds.body.builds.length, 2);
      });
    });
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
      assert.equal(res.headers['x-taskcluster-status'], 'failure');
      assert.equal(res.headers['content-length'], 5572);
    });
  });

  test('build badges - status:failure (checks API)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'failure'));
      assert.equal(res.headers['x-taskcluster-status'], 'failure');
      assert.equal(res.headers['content-length'], 5572);
    });
  });

  test('build badges - status:failure (combined status and checks)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'combined'));
      assert.equal(res.headers['x-taskcluster-status'], 'failure');
      assert.equal(res.headers['content-length'], 5572);
    });
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'combined2'));
      assert.equal(res.headers['x-taskcluster-status'], 'failure');
      assert.equal(res.headers['content-length'], 5572);
    });
  });

  test('build badges - status: success', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'awesomeRepo', 'master'));
      assert.equal(res.headers['x-taskcluster-status'], 'success');
      assert.equal(res.headers['content-length'], 8030);
    });
  });

  test('build badges - status: success (checks API)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'success'));
      assert.equal(res.headers['x-taskcluster-status'], 'success');
      assert.equal(res.headers['content-length'], 8030);
    });
  });

  test('build badges - status: pending (checks API)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'checksRepo', 'pending'));
      assert.equal(res.headers['x-taskcluster-status'], 'pending');
      assert.equal(res.headers['content-length'], 7182);
    });
  });

  test('build badges - error', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'errorRepo', 'master'));
      assert.equal(res.headers['x-taskcluster-status'], 'error');
      assert.equal(res.headers['content-length'], 5106);
    });
  });

  test('build badges - no such status', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'unknownRepo', 'master'));
      assert.equal(res.headers['x-taskcluster-status'], 'newrepo');
      assert.equal(res.headers['content-length'], 6998);
    });
  });

  test('build badges - new repo (no info yet)', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'nonTCGHRepo', 'master'));
      assert.equal(res.headers['x-taskcluster-status'], 'newrepo');
      assert.equal(res.headers['content-length'], 6998);
    });
  });

  test('build badges - checks conclusion - timed out', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'softStatusRepo', 'timedout'));
      assert.equal(res.headers['x-taskcluster-status'], 'timed_out');
      assert.equal(res.headers['content-length'], 7159);
    });
  });
  test('build badges - checks conclusion - action required', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'softStatusRepo', 'actionRequired'));
      assert.equal(res.headers['x-taskcluster-status'], 'action_required');
      assert.equal(res.headers['content-length'], 10864);
    });
  });
  test('build badges - checks conclusion - skipped', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'softStatusRepo', 'skipped'));
      assert.equal(res.headers['x-taskcluster-status'], 'skipped');
      assert.equal(res.headers['content-length'], 7248);
    });
  });
  test('build badges - checks conclusion - stale', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'softStatusRepo', 'stale'));
      assert.equal(res.headers['x-taskcluster-status'], 'stale');
      assert.equal(res.headers['content-length'], 5509);
    });
  });
  test('build badges - checks conclusion - neutral', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'softStatusRepo', 'neutral'));
      assert.equal(res.headers['x-taskcluster-status'], 'neutral');
      assert.equal(res.headers['content-length'], 5775);
    });
  });
  test('build badges - checks conclusion - cancelled', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:get-badge:abc123:*'], async () => {
      let res = await got(helper.apiClient.buildUrl(helper.apiClient.badge, 'abc123', 'softStatusRepo', 'cancelled'));
      assert.equal(res.headers['x-taskcluster-status'], 'cancelled');
      assert.equal(res.headers['content-length'], 7836);
    });
  });

  test('build badges without scopes', async function() {
    const client = new helper.GithubClient({ rootUrl: helper.rootUrl });
    await assert.rejects(
      () => client.badge('a', 'b', 'c'),
      err => err.code === 'InsufficientScopes');
  });

  test('link for clickable badges with status', async function() {
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

  test('link for clickable badges with checks', async function() {
    let res;

    await testing.fakeauth.withAnonymousScopes(['github:latest-status:abc123:*'], async () => {
      // check if the function returns a correct link
      try {
        res = await got(
          helper.apiClient.buildUrl(helper.apiClient.latest, 'abc123', 'checksRepo', 'success'),
          { followRedirect: false });
      } catch (e) {
        console.log(`Test for redirecting to correct page failed. Error: ${JSON.stringify(e)}`);
      }
      assert.equal(res.body, 'Found. Redirecting to https://example.com/abc123/checksRepo/runs/2');
    });
  });

  test('link for clickable badges when no such thing exists', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:latest-status:abc123:*'], async () => {
      await assert.rejects(() => got(
        helper.apiClient.buildUrl(helper.apiClient.latest, 'abc123', 'unknownRepo', 'nosuch'),
        { followRedirect: false }), err => err.response.statusCode === 404);
    });
  });

  test('link for clickable badges when no branch exists', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:latest-status:abc123:*'], async () => {
      await assert.rejects(() => got(
        helper.apiClient.buildUrl(helper.apiClient.latest, 'abc123', 'checksRepo', 'noSuchBranch'),
        { followRedirect: false }), err => err.response.statusCode === 404);
    });
  });

  test('link for clickable badges when no installation exists', async function() {
    await testing.fakeauth.withAnonymousScopes(['github:latest-status:noSuchOwner:*'], async () => {
      await assert.rejects(() => got(
        helper.apiClient.buildUrl(helper.apiClient.latest, 'noSuchOwner', 'noSuchRepo', 'noSuchBranch'),
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

  test('status creation where integration lacks permission', async function() {
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

  suite('render taskcluster.yml', function() {
    const tcYaml = `version: 1
reporting: checks-v1
policy:
  pullRequests: public
tasks:
  $let:
    head_rev:
      $switch:
        tasks_for == "github-pull-request": \${event.pull_request.head.sha}
        tasks_for == "github-push": \${event.after}
        $default: UNKNOWN
    repository:
      $if: tasks_for == "github-pull-request"
      then: \${event.pull_request.head.repo.html_url}
      else: \${event.repository.html_url}
  in:
    $match:
      (tasks_for == "github-push") || (tasks_for == "github-pull-request" && event["action"] in ["opened", "synchronize"]):
        taskId:
          $eval: as_slugid("test")
        deadline:
          $fromNow: 1 day
        taskQueueId: proj-misc/tutorial
        metadata:
          owner: \${event.sender.login}@users.noreply.github.com
          source: \${event.repository.url}
        payload:
          maxRunTime: 3600
`;
    const eventTypes = [
      { fakeEvent: { type: 'github-push' }, tasksCount: 1, scopesCount: 3, scope: 'branch:main' },
      { fakeEvent: { type: 'github-push', overrides: { branch: 'stage' } }, tasksCount: 1, scopesCount: 3, scope: 'branch:stage' },
      { fakeEvent: { type: 'github-push', overrides: { ref: "refs/tags/v1.0.2" } }, tasksCount: 1, scopesCount: 3, scope: 'tag:v1.0.2' },
      { fakeEvent: { type: 'github-pull-request', action: 'opened' }, tasksCount: 1, scopesCount: 3, scope: 'pull-request' },
      { fakeEvent: { type: 'github-pull-request', action: 'synchronize' }, tasksCount: 1, scopesCount: 3, scope: 'pull-request' },
      { fakeEvent: { type: 'github-pull-request', action: 'assigned' }, tasksCount: 0, scopesCount: 3, scope: 'pull-request' },
      { fakeEvent: { type: 'github-pull-request-untrusted', action: 'opened' }, tasksCount: 0, scopesCount: 3, scope: 'pull-request-untrusted' },
      { fakeEvent: { type: 'github-release', action: 'published' }, tasksCount: 0, scopesCount: 3, scope: 'release:published' },
      { fakeEvent: { type: 'github-release', action: 'released' }, tasksCount: 0, scopesCount: 3, scope: 'release:released' },
    ];
    eventTypes.map(({ fakeEvent, tasksCount, scopesCount, scope }) =>
      test(`render .tc.yml for event ${fakeEvent.type} ${fakeEvent.action || ''} ${scope}`, async function() {
        const { tasks, scopes } = await helper.apiClient.renderTaskclusterYml({
          body: tcYaml,
          fakeEvent,
          repository: 'awesomeRepo',
          organization: 'org',
        });
        assert.equal(tasks.length, tasksCount);
        assert.deepEqual(tasks.map(t => t.task.taskQueueId), tasksCount > 0 ? ['proj-misc/tutorial'] : []);
        assert.equal(scopes.length, scopesCount);
        assert.deepEqual(scopes, [
          `assume:repo:github.com/org/awesomeRepo:${scope}`,
          'queue:route:checks',
          'queue:scheduler-id:tc-gh-devel',
        ]);
      }),
    );
    test('invalid branch name is properly escaped', async function () {
      const tcYaml = `version: 1
reporting: checks-v1
tasks: []
`;
      const { tasks } = await helper.apiClient.renderTaskclusterYml({
        body: tcYaml,
        fakeEvent: { type: 'github-push', overrides: { branch: 'lol", "this"' } },
        repository: 'repo',
        organization: 'org',
      });
      assert.deepEqual(tasks, []);
    });
  });
});
