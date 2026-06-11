import helper from './helper.js';
import { SentryApiClient } from '../src/sentrymanager.js';
import taskcluster from '@taskcluster/client';
import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import nock from 'nock';

suite('SentryApiClient', () => {
  const origin = 'https://sentry.example.com';
  const token = 'secret-token';
  let client;

  setup(() => {
    client = new SentryApiClient(origin, { token });
  });

  teardown(() => {
    nock.cleanAll();
  });

  const sentryApi = () => nock(origin, {
    reqheaders: {
      authorization: `Bearer ${token}`,
    },
  });

  test('initializes the API surface auth uses', () => {
    assert.equal(typeof client.organizations.projects, 'function');
    assert.equal(typeof client.projects.keys, 'function');
    assert.equal(typeof client.projects.createKey, 'function');
    assert.equal(typeof client.projects.deleteKey, 'function');
    assert.equal(typeof client.teams.createProject, 'function');
  });

  test('uses bearer auth and parses organization projects', async () => {
    const sentry = sentryApi()
      .get('/api/0/organizations/taskcluster/projects/')
      .reply(200, [{ slug: 'project-one' }]);

    assert.deepStrictEqual(await client.organizations.projects('taskcluster'), [{ slug: 'project-one' }]);
    assert.equal(true, sentry.isDone());
  });

  test('parses project keys', async () => {
    const sentry = sentryApi()
      .get('/api/0/projects/taskcluster/project-one/keys/')
      .reply(200, [{ id: 'key-one' }]);

    assert.deepStrictEqual(await client.projects.keys('taskcluster', 'project-one'), [{ id: 'key-one' }]);
    assert.equal(true, sentry.isDone());
  });

  test('creates projects with JSON bodies', async () => {
    const project = { name: 'project-one', slug: 'project-one' };
    const sentry = sentryApi()
      .post('/api/0/teams/taskcluster/team-one/projects/', project)
      .reply(201, { slug: 'project-one' });

    assert.deepStrictEqual(
      await client.teams.createProject('taskcluster', 'team-one', project),
      { slug: 'project-one' },
    );
    assert.equal(true, sentry.isDone());
  });

  test('creates client keys with JSON bodies', async () => {
    const sentry = sentryApi()
      .post('/api/0/projects/taskcluster/project-one/keys/', { name: 'key-one' })
      .reply(201, { id: 'key-one' });

    assert.deepStrictEqual(
      await client.projects.createKey('taskcluster', 'project-one', { name: 'key-one' }),
      { id: 'key-one' },
    );
    assert.equal(true, sentry.isDone());
  });

  test('deletes client keys', async () => {
    const sentry = sentryApi()
      .delete('/api/0/projects/taskcluster/project-one/keys/key-one/')
      .reply(204);

    assert.strictEqual(await client.projects.deleteKey('taskcluster', 'project-one', 'key-one'), undefined);
    assert.equal(true, sentry.isDone());
  });

  test('surfaces Sentry detail errors', async () => {
    const sentry = sentryApi()
      .get('/api/0/projects/taskcluster/missing/keys/')
      .reply(404, { detail: 'Project not found' });

    await assert.rejects(
      () => client.projects.keys('taskcluster', 'missing'),
      err => err.message === 'Project not found',
    );
    assert.equal(true, sentry.isDone());
  });

  test('surfaces HTTP status errors', async () => {
    const sentry = sentryApi()
      .get('/api/0/projects/taskcluster/missing/keys/')
      .reply(400);

    await assert.rejects(
      () => client.projects.keys('taskcluster', 'missing'),
      err => err.message.includes('400'),
    );
    assert.equal(true, sentry.isDone());
  });
});

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], (mock, skipping) => {
  if (!mock) {
    return; // We don't test this with real credentials for now!
  }
  suite('regular SentryManager with fake client', () => {
    helper.withCfg(mock, skipping);
    helper.withDb(mock, skipping);
    helper.withSentry(mock, skipping);
    helper.withPulse(mock, skipping);
    helper.withServers(mock, skipping);

    test('sentryDSN api method', async () => {
      await helper.apiClient.sentryDSN('playground');
    });

    test('purgeExpiredKeys', async () => {
      let sentryManager = await helper.load('sentryManager', helper.overwrites);

      // There shouldn't be any keys that'll expire from this
      // As keys shouldn't have been any keys created 100 years ago
      // This tests that we don't just purge all keys, but only the ones expired.
      let farInThePast = taskcluster.fromNow('- 100 years');
      let expired = await sentryManager.purgeExpiredKeys(farInThePast);
      assert(expired === 0, 'Didn\'t expect any keys to expire!');

      // There should be keys expired, when we expire 7 days into the future
      // we should at least see the key from the test case above be expired
      let aWeekFromNow = taskcluster.fromNow('7 days');
      expired = await sentryManager.purgeExpiredKeys(aWeekFromNow);
      assert(expired > 0, 'Expected at least one key to be expired');
    });
  });

  suite('NullSentryManager', () => {
    suiteSetup('zero out sentry config', () => {
      helper.load.cfg('app.sentry', {});
    });
    helper.withDb(mock, skipping);
    helper.withCfg(mock, skipping);
    helper.withSentry(mock, skipping);
    helper.withPulse('mock', skipping);
    helper.withServers(mock, skipping);
    helper.resetTables(mock, skipping);

    test('sentryDSN api method', async () => {
      await assert.rejects(
        () => helper.apiClient.sentryDSN('playground'),
        err => err.statusCode === 404);
    });

    test('purgeExpiredKeys', async () => {
      const sm = await helper.load('sentryManager');
      assert.strictEqual(await sm.purgeExpiredKeys(), 0);
    });
  });
});
