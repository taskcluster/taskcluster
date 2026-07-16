import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import request from 'superagent';
import testing from '@taskcluster/lib-testing';
import helper from './helper.js';
import Github from '../src/login/strategies/github.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withGithubClient();
  helper.resetTables();

  suite(testing.suiteName(), () => {
    const makeUser = userId => {
      return helper.db.fns.add_github_access_token(
        userId,
        helper.db.encrypt({ value: Buffer.from('qwerty', 'utf8') }) // access token
      );
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
        monitor: {
          debug: () => {},
        },
        db: helper.db,
      });

      return strategy;
    };

    test('userFromIdentity with matching ID', async () => {
      const userId = String(helper.githubFixtures.users.octocat);
      const strategy = getStrategy();
      await makeUser(userId);
      const user = await strategy.userFromIdentity(`github/${userId}|octocat`);
      assert(user, 'returned undefined');
      assert.equal(user.identity, `github/${userId}|octocat`);
    });

    test('userFromIdentity with non-matching ID', async () => {
      const userId = String(helper.githubFixtures.users.octocat);
      const strategy = getStrategy();
      await makeUser(userId);
      const user = await strategy.userFromIdentity('github/999|octocat');
      assert(!user, 'did not return undefined');
    });

    test('userFromIdentity with encoded userId', async () => {
      const userId = String(helper.githubFixtures.users['a/c']);
      const strategy = getStrategy();
      await makeUser(userId);
      const user = await strategy.userFromIdentity(`github/${userId}|a!2Fc`);
      assert(user, 'returned undefined');
      assert.equal(user.identity, `github/${userId}|a!2Fc`);
    });

    test('userFromIdentity with unknown user', async () => {
      const strategy = getStrategy();
      await makeUser('99');
      const user = await strategy.userFromIdentity('github/20|NOSUCH');
      assert(!user, 'did not return undefined');
    });

    test('userFromIdentity with GitHub failure', async () => {
      await assert.rejects(async () => {
        const strategy = getStrategy();
        await makeUser(String(20));

        return strategy.userFromIdentity('github/20|FAIL');
      }, /uhoh/);
    });

    test('userFromIdentity roles with known user', async () => {
      const userId = String(helper.githubFixtures.users.taskcluster);
      const strategy = getStrategy();
      await makeUser(userId);
      const user = await strategy.userFromIdentity(`github/${userId}|taskcluster`);
      assert.deepEqual(
        user.roles.sort(),
        [
          'github-team:neutrinojs/team-1',
          'github-team:taskcluster/team-3',
          'github-org-admin:taskcluster',
          'github-org-admin:neutrinojs',
        ].sort()
      );
    });

    test('userFromIdentity user with empty roles', async () => {
      const userId = String(helper.githubFixtures.users['a/c']);
      const strategy = getStrategy();
      await makeUser(userId);
      const user = await strategy.userFromIdentity(`github/${userId}|a!2Fc`);
      assert.deepEqual(user.roles, []);
    });

    test('userFromIdentity only has org roles in which they are admin', async () => {
      const userId = String(helper.githubFixtures.users.octocat);
      const strategy = getStrategy();
      await makeUser(userId);
      const user = await strategy.userFromIdentity(`github/${userId}|octocat`);

      // First make sure the user is not an admin in all of the orgs they are apart of
      assert(helper.githubFixtures.orgs.octocat.some(org => org.role !== 'admin'));
      assert.deepEqual(
        user.roles.filter(role => role.startsWith('github-org-')),
        ['github-org-admin:taskcluster'].sort()
      );
    });

    suite('oauth state parameter', () => {
      const serverCfg = {
        ...cfg,
        app: { publicUrl: 'https://tc.example.com' },
        taskcluster: { credentials: { clientId: 'client-id', accessToken: 'access-token' } },
      };

      let server, port;

      suiteSetup(async () => {
        const app = express();
        app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
        app.use(passport.initialize());
        app.use(passport.session());

        const strategy = new Github({
          name: 'github',
          cfg: serverCfg,
          monitor: { debug: () => {} },
          db: {},
        });
        strategy.useStrategy(app, serverCfg);

        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        port = server.address().port;
      });

      suiteTeardown(async () => {
        if (server) {
          await new Promise(resolve => server.close(resolve));
        }
      });

      test('the authorization request includes a state parameter', async () => {
        const res = await request
          .get(`http://127.0.0.1:${port}/login/github`)
          .redirects(0)
          .ok(res => res.status === 302);

        const location = new URL(res.header.location);
        assert.equal(location.origin + location.pathname, 'https://github.com/login/oauth/authorize');
        assert(location.searchParams.get('state'));
      });
    });
  });
});
