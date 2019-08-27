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
});
