import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import helper from './helper.js';
import libUrls from 'taskcluster-lib-urls';
import testing from '@taskcluster/lib-testing';

const dataDir = new URL('./data', import.meta.url).pathname;
const loadWebhook = filename => JSON.parse(fs.readFileSync(path.join(dataDir, 'webhooks', filename), 'utf8'));

/**
 * The handler which announces that a push changed a repository's
 * `.taskcluster.yml`.  It runs off the push exchange, so these drive it with a
 * push message rather than with a webhook request.
 */
helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withFakeGithub();
  helper.withPulse(skipping);
  helper.resetTables();

  const INST_ID = 5808;
  const OWNER = { owner: 'TaskclusterRobot', repo: 'hooks-testing' };
  const EVENT_ID = '26370a80-ed65-11e6-8f4c-80082678482d';

  let github, handlers;

  setup(async () => {
    helper.load.save();
    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
    github = await helper.load('github');
    handlers = await helper.load('handlers');
    await handlers.setup();

    // the job handler binds to the push exchange as well, and a fake pulse
    // message reaches every consumer that matches it.  Stopping it keeps these
    // tests to the one handler they are about.
    await handlers.jobPq.stop();
  });

  teardown(async () => {
    await handlers.terminate();
    helper.load.restore();
  });

  // Deliver a push message carrying `body`, and resolve once the handler is done
  // with it.
  const push = async body => {
    const handlerComplete = new Promise((resolve, reject) => {
      handlers.handlerComplete = resolve;
      handlers.handlerRejected = reject;
    });

    await helper.fakePulseMessage({
      exchange: 'exchange/taskcluster-github/v1/push',
      routingKey: 'primary.TaskclusterRobot.hooks-testing',
      routes: [],
      payload: {
        organization: 'TaskclusterRobot',
        repository: 'hooks-testing',
        eventId: EVENT_ID,
        installationId: INST_ID,
        version: 1,
        body,
        branch: 'master',
        details: {},
        tasks_for: 'github-push',
      },
    });
    await handlerComplete;
  };

  const assertPublished = (ref = 'refs/heads/master') =>
    helper.assertPulseMessage('taskcluster-yml-update', m => {
      if (m.routingKey !== 'primary.TaskclusterRobot.hooks-testing') {
        return false;
      }
      // the payload is deliberately narrow, so assert on the whole of it.
      assert.deepEqual(m.payload, {
        organization: 'TaskclusterRobot',
        repository: 'hooks-testing',
        ref,
        eventId: EVENT_ID,
        version: 1,
      });
      return true;
    });

  const assertNotPublished = () => helper.assertNoPulseMessage('taskcluster-yml-update');

  const fixtureTest = (testName, filename, publishes) =>
    test(testName, async () => {
      await push(loadWebhook(filename).body);
      if (publishes) {
        assertPublished();
      } else {
        assertNotPublished();
      }
    });

  fixtureTest('publishes when the file was modified', 'webhook.push.tcyml.json', true);
  fixtureTest('publishes when the file was added', 'webhook.push.tcyml_added.json', true);
  fixtureTest('publishes when the file was removed', 'webhook.push.tcyml_removed.json', true);
  fixtureTest('stays quiet when the push misses the file', 'webhook.push.json', false);
  fixtureTest('stays quiet when the branch was deleted', 'webhook.push.deleted_branch.json', false);

  test('carries the ref that was pushed to', async () => {
    const body = loadWebhook('webhook.push.tcyml.json').body;
    body.ref = 'refs/heads/releases/v1.0';

    await push(body);
    assertPublished('refs/heads/releases/v1.0');
  });

  test('keeps a dotted repository name whole in the payload and escapes it in the routing key', async () => {
    const body = loadWebhook('webhook.push.tcyml.json').body;
    body.repository.name = 'taskcluster.github.io';

    await push(body);

    helper.assertPulseMessage('taskcluster-yml-update', m => {
      // a period separates words in a routing key, so it cannot survive there,
      // but a consumer reading the payload should not have to know that.
      assert.equal(m.routingKey, 'primary.TaskclusterRobot.taskcluster%github%io');
      assert.equal(m.payload.repository, 'taskcluster.github.io');
      return true;
    });
  });

  suite('truncated push', () => {
    // GitHub caps the webhook `commits` array at 2048 entries and each commit's
    // file lists at 3000 names, and reports neither count, so hitting a cap is
    // the only signal that something was dropped.
    // https://docs.github.com/en/webhooks/webhook-events-and-payloads#push
    const COMMITS_LIMIT = 2048;
    const FILES_LIMIT = 3000;

    const otherFiles = count => Array.from({ length: count }, (_unused, i) => `file-${i}.txt`);

    // A push at one of the two caps, where no listed commit touches
    // `.taskcluster.yml`.  Bodies this large are built here rather than kept as
    // a fixture.
    const truncatedPush = ({ commitCount = COMMITS_LIMIT, fileCount = 1 } = {}) => {
      const body = loadWebhook('webhook.push.json').body;
      const commit = body.commits[0];
      body.commits = Array.from({ length: commitCount }, (_unused, i) => ({
        ...commit,
        id: String(i).padStart(40, '0'),
        added: [],
        removed: [],
        modified: otherFiles(fileCount),
      }));
      return body;
    };

    const setYml = (ref, version) => github.inst(INST_ID).setTaskclusterYml({ ...OWNER, ref, content: { version } });

    test('publishes when the file changed', async () => {
      const body = truncatedPush();
      setYml(body.before, 0);
      setYml(body.after, 1);

      await push(body);
      assertPublished();
    });

    test('publishes when the file was added', async () => {
      const body = truncatedPush();
      setYml(body.after, 1);

      await push(body);
      assertPublished();
    });

    test('publishes when the file was deleted', async () => {
      const body = truncatedPush();
      setYml(body.before, 1);

      await push(body);
      assertPublished();
    });

    test('publishes when the push created the branch and the file is on it', async () => {
      const body = truncatedPush();
      body.created = true;
      body.before = '0'.repeat(40);
      setYml(body.after, 1);

      await push(body);
      assertPublished();
    });

    test('stays quiet when the file was left alone', async () => {
      const body = truncatedPush();
      setYml(body.before, 1);
      setYml(body.after, 1);

      await push(body);
      assertNotPublished();
    });

    test('publishes when one commit reported its file cap and the file changed', async () => {
      const body = truncatedPush({ commitCount: 1, fileCount: FILES_LIMIT });
      setYml(body.before, 0);
      setYml(body.after, 1);

      await push(body);
      assertPublished();
    });

    test('stays quiet when one commit reported its file cap and the file did not change', async () => {
      const body = truncatedPush({ commitCount: 1, fileCount: FILES_LIMIT });
      setYml(body.before, 1);
      setYml(body.after, 1);

      await push(body);
      assertNotPublished();
    });
  });
});
