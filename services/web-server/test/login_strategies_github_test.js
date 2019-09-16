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
    ],
    'a/c': [],
  };
  const taskclusterRepos = ['taskcluster-client', 'taskcluster-queue', 'docker-worker'];
  const neutrinojsRepos = ['neutrino', 'webpack-chain'];
  const repos = {
    'taskcluster': taskclusterRepos.map(repo => ({ name: repo })),
    'neutrinojs': neutrinojsRepos.map(repo => ({ name: repo })),
  };
  class FakeGithubClient {
    async userFromUsername(username) {
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

    async orgsFromUsername(username) {
      if (username === 'FAIL') {
        throw new Error('uhoh');
      }

      const organizations = orgs[username];

      if (!organizations) {
        throw new Error(`orgs for user ${username} not found`);
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
    assert.deepEqual(user.roles, [...taskclusterRepos.map(repo => `github-group:taskcluster/${repo}`), ...neutrinojsRepos.map(repo => `github-group:neutrinojs/${repo}`)]);
  });

  test('userFromIdentity user with empty roles', async function() {
    const user = await strategy.userFromIdentity('github/30|a!2Fc');
    assert.deepEqual(user.roles, []);
  });
});
