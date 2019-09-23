const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');
const Github = require('../src/login/strategies/github');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);

  suite(testing.suiteName(), () => {
    // set up some fakes
    const users = {
      'octocat': 10,
      'taskcluster': 20,
      'a/c': 30,
    };
    const orgs = {
      'octocat': [
        { role: 'admin', organization: { login: 'taskcluster' } },
        { role: 'member', organization: { login: 'neutrinojs' } },
      ],
      'taskcluster': [
        { role: 'admin', organization: { login: 'taskcluster' } },
        { role: 'admin', organization: { login: 'neutrinojs' } },
      ],
      'a/c': [],
    };
    const teams = {
      'octocat': [
        { slug: 'team-1' },
        { slug: 'team-2' },
      ],
      'taskcluster': [
        { slug: 'team-3' },
        { slug: 'team-1' },
      ],
      'a/c': [],
    };
    const makeUser = (options) => {
      return helper.GithubAccessToken.create({
        userId: '99',
        accessToken: 'qwerty',
        expires: taskcluster.fromNow('1000 years'),
        ...options,
      }, true);
    };

    class FakeGithubClient {
      constructor() {
        this.currentUsername = null;
      }

      async userFromUsername(username) {
        this.currentUsername = username;

        if (username === 'FAIL') {
          throw new Error('uhoh');
        }

        const user_id = users[username];

        if (!user_id) {
          const err = new Error('No such user');
          err.status = 404;
          throw err;
        }

        return {id: user_id};
      }

      async userMembershipsOrgs() {
        const organizations = orgs[this.currentUsername];

        if (!organizations) {
          throw new Error(`memberships orgs for user ${this.currentUsername} not found`);
        }

        return organizations;
      }

      async listTeams() {
        const userTeams = teams[this.currentUsername];

        if (!userTeams) {
          throw new Error(`orgs for user ${this.currentUsername} not found`);
        }

        return userTeams;
      }
    }

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
      });

      strategy.clients = new Map([
        [users.octocat, new FakeGithubClient()],
        [users.taskcluster, new FakeGithubClient()],
        [users['a/c'], new FakeGithubClient()],
      ]);

      return strategy;
    };

    test('userFromIdentity with matching ID', async function() {
      const strategy = getStrategy();
      await makeUser({ userId: String(users.octocat) });
      const user = await strategy.userFromIdentity('github/10|octocat');
      assert(user, "returned undefined");
      assert.equal(user.identity, 'github/10|octocat');
    });

    test('userFromIdentity with non-matching ID', async function() {
      const strategy = getStrategy();
      await makeUser({ userId: String(users.octocat) });
      const user = await strategy.userFromIdentity('github/999|octocat');
      assert(!user, "did not return undefined");
    });

    test('userFromIdentity with encoded userId', async function() {
      const strategy = getStrategy();
      await makeUser({ userId: String(users['a/c']) });
      const user = await strategy.userFromIdentity('github/30|a!2Fc');
      assert(user, "returned undefined");
      assert.equal(user.identity, 'github/30|a!2Fc');
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
      const strategy = getStrategy();
      await makeUser({ userId: String(users.taskcluster) });
      const user = await strategy.userFromIdentity('github/20|taskcluster');
      assert.deepEqual(user.roles.sort(), ['github-team:team-1', 'github-team:team-3', 'github-org-admin:taskcluster', 'github-org-admin:neutrinojs'].sort());
    });

    test('userFromIdentity user with empty roles', async function() {
      const strategy = getStrategy();
      await makeUser({ userId: String(users['a/c']) });
      const user = await strategy.userFromIdentity('github/30|a!2Fc');
      assert.deepEqual(user.roles, []);
    });

    test('userFromIdentity only has org roles in which they are admin', async function() {
      const strategy = getStrategy();
      await makeUser({ userId: String(users.octocat) });
      const user = await strategy.userFromIdentity('github/10|octocat');

      // First make sure the user is not an admin in all of the orgs they are apart of
      assert(orgs['octocat'].some(org => org.role !== 'admin'));
      assert.deepEqual(user.roles.filter(role => role.startsWith('github-org-')), ['github-org-admin:taskcluster'].sort());
    });
  });
});
