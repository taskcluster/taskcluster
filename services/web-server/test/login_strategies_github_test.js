const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const helper = require('./helper');
const Github = require('../src/login/strategies/github');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withGithubClient();

  suite(testing.suiteName(), () => {
    const makeUser = (options) => {
      return helper.GithubAccessToken.create({
        userId: '99',
        accessToken: 'qwerty',
        ...options,
      }, true);
    };

    const cfg = {
      login: {
        strategies: {
          github: {
            clientId: 'clid',
            clientSecret: 'clsec',
          },
        },
      },
    };

    const getStrategy = () => {
      const strategy = new Github({
        name: 'github',
        cfg,
        GithubAccessToken: helper.GithubAccessToken,
        monitor: {
          debug: () => {},
        },
      });

      return strategy;
    };

    test('userFromIdentity with matching ID', async function() {
      const userId = String(helper.githubFixtures.users.octocat);
      const strategy = getStrategy();
      await makeUser({ userId });
      const user = await strategy.userFromIdentity(`github/${userId}|octocat`);
      assert(user, "returned undefined");
      assert.equal(user.identity, `github/${userId}|octocat`);
    });

    test('userFromIdentity with non-matching ID', async function() {
      const userId = String(helper.githubFixtures.users.octocat);
      const strategy = getStrategy();
      await makeUser({ userId });
      const user = await strategy.userFromIdentity('github/999|octocat');
      assert(!user, "did not return undefined");
    });

    test('userFromIdentity with encoded userId', async function() {
      const userId = String(helper.githubFixtures.users['a/c']);
      const strategy = getStrategy();
      await makeUser({ userId });
      const user = await strategy.userFromIdentity(`github/${userId}|a!2Fc`);
      assert(user, "returned undefined");
      assert.equal(user.identity, `github/${userId}|a!2Fc`);
    });

    test('userFromIdentity with unknown user', async function() {
      const strategy = getStrategy();
      await makeUser();
      const user = await strategy.userFromIdentity('github/20|NOSUCH');
      assert(!user, "did not return undefined");
    });

    test('userFromIdentity with GitHub failure', async function() {
      await assert.rejects(async () => {
        const strategy = getStrategy();
        await makeUser({ userId: String(20) });

        return strategy.userFromIdentity('github/20|FAIL');
      }, /uhoh/);
    });

    test('userFromIdentity roles with known user', async function() {
      const userId = String(helper.githubFixtures.users.taskcluster);
      const strategy = getStrategy();
      await makeUser({ userId });
      const user = await strategy.userFromIdentity(`github/${userId}|taskcluster`);
      assert.deepEqual(user.roles.sort(), ['github-team:neutrinojs/team-1', 'github-team:taskcluster/team-3', 'github-org-admin:taskcluster', 'github-org-admin:neutrinojs'].sort());
    });

    test('userFromIdentity user with empty roles', async function() {
      const userId = String(helper.githubFixtures.users['a/c']);
      const strategy = getStrategy();
      await makeUser({ userId });
      const user = await strategy.userFromIdentity(`github/${userId}|a!2Fc`);
      assert.deepEqual(user.roles, []);
    });

    test('userFromIdentity only has org roles in which they are admin', async function() {
      const userId = String(helper.githubFixtures.users.octocat);
      const strategy = getStrategy();
      await makeUser({ userId });
      const user = await strategy.userFromIdentity(`github/${userId}|octocat`);

      // First make sure the user is not an admin in all of the orgs they are apart of
      assert(helper.githubFixtures.orgs.octocat.some(org => org.role !== 'admin'));
      assert.deepEqual(user.roles.filter(role => role.startsWith('github-org-')), ['github-org-admin:taskcluster'].sort());
    });
  });
});
