const assert = require('assert');
const Github = require('../src/login/strategies/github');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), () => {
  // set up some fakes
  const users = {
    'octocat': 10,
    'taskcluster': 20,
    'a/c': 30,
  };
  const orgs = {
    'octocat': [
      { login: 'taskcluster' },
      { login: 'neutrinojs' },
    ],
    'taskcluster': [
      { login: 'taskcluster' },
      { login: 'neutrinojs' },
    ],
    'a/c': [],
  };
  const repos = {
    'taskcluster': [{ name: 'taskcluster-client' }, { name: 'taskcluster-queue' }],
    'neutrinojs': [{ name: 'neutrino' }, { name: 'webpack-chain' }],
  };
  const userOrgPermissionLevel = {
    'taskcluster': {
      'taskcluster-client': {
        'octocat': { permission: 'admin' },
        'taskcluster': { permission: 'read' },
      },
      'taskcluster-queue': {
        'octocat': { permission: 'none' },
        'taskcluster': { permission: 'write' },
      },
    },
    'neutrinojs': {
      'neutrino': {
        'octocat': { permission: 'admin' },
        'taskcluster': { permission: 'admin' },
      },
      'webpack-chain': {
        'octocat': { permission: 'none' },
        'taskcluster': { permission: 'none' },
      },
    },
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

    async listOrgs() {
      const organizations = orgs[this.currentUsername];

      if (!organizations) {
        throw new Error(`orgs for user ${this.currentUsername} not found`);
      }

      return organizations;
    }

    async reposFromOrg(org) {
      if (org === 'FAIL') {
        throw new Error('uhoh');
      }

      const repositories = repos[org];

      if (!repositories) {
        throw new Error(`repos for org ${org} not found`);
      }

      return repositories;
    }

    async readPermissionLevel(org, repo, username) {
      const userPermissionLevel = userOrgPermissionLevel[org][repo][username];

      if (!userPermissionLevel) {
        throw new Error(`permission level for ${username} in ${org}/${repo} not found`);
      }

      // User has write access if permission is `admin` or `write`
      return userPermissionLevel;
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
  const strategy = new Github({name: 'github', cfg});
  strategy.githubClient = new FakeGithubClient();

  test('userFromIdentity with matching ID', async function() {
    const user = await strategy.userFromIdentity('github/10|octocat');
    assert(user, "returned undefined");
    assert.equal(user.identity, 'github/10|octocat');
  });

  test('userFromIdentity with non-matching ID', async function() {
    const user = await strategy.userFromIdentity('github/999|octocat');
    assert(!user, "did not return undefined");
  });

  test('userFromIdentity with encoded userId', async function() {
    const user = await strategy.userFromIdentity('github/30|a!2Fc');
    assert(user, "returned undefined");
    assert.equal(user.identity, 'github/30|a!2Fc');
  });

  test('userFromIdentity with unknown user', async function() {
    const user = await strategy.userFromIdentity('github/20|NOSUCH');
    assert(!user, "did not return undefined");
  });

  test('userFromIdentity with GitHub failure', async function() {
    assert.rejects(() => strategy.userFromIdentity('github/20|FAIL'), /uhoh/);
  });

  test('userFromIdentity roles with known user', async function() {
    const user = await strategy.userFromIdentity('github/10|octocat');

    assert.deepEqual(user.roles, ['github-group:taskcluster/taskcluster-client', 'github-group:neutrinojs/neutrino']);
  });

  test('userFromIdentity user with empty roles', async function() {
    const user = await strategy.userFromIdentity('github/30|a!2Fc');
    assert.deepEqual(user.roles, []);
  });

  test('userFromIdentity only has roles with write access', async function() {
    const user = await strategy.userFromIdentity('github/20|taskcluster');

    assert.deepEqual(user.roles, ['github-group:taskcluster/taskcluster-queue', 'github-group:neutrinojs/neutrino']);
  });
});
