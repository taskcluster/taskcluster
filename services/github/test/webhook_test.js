import fs from 'fs';
import helper from './helper.js';
import assert from 'assert';
import testing from '@taskcluster/lib-testing';
import { LEVELS } from '@taskcluster/lib-monitor';

const TC_DEV_INSTALLATION_ID = 28513985;

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  let github = null;
  let monitor;

  setup(async function() {
    github = await helper.load('github');
    github.inst(5808).setUser({ id: 14795478, email: 'someuser@github.com', username: 'TaskclusterRobot' });
    github.inst(5808).setUser({ id: 18102552, email: 'anotheruser@github.com', username: 'owlishDeveloper' });
    github.inst(TC_DEV_INSTALLATION_ID).setUser({ id: 83861, email: 'lotas@users.noreply.github.com', username: 'lotas' });
    monitor = await helper.load('monitor');
  });

  // Check the status code returned from a request containing some test data
  function statusTest(testName, jsonFile, statusCode, installationId = 5808, check = () => {}) {
    test(testName, async function() {
      const filename = './test/data/webhooks/' + jsonFile;
      let request = JSON.parse(fs.readFileSync(filename));
      let response = await helper.jsonHttpRequest(filename);
      assert.equal(response.statusCode, statusCode);
      response.connection.destroy();
      if (statusCode < 300) {
        assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'webhook-received'), {
          Type: 'webhook-received',
          Logger: 'taskcluster.test.api',
          Fields: {
            eventId: request.headers['X-GitHub-Delivery'],
            eventType: request.headers['X-GitHub-Event'],
            installationId,
            v: 1,
          },
          Severity: LEVELS.notice,
        });
      } else if (statusCode === 403) {
        const errorEntry = monitor.manager.messages.find(({ Type }) => Type === 'monitor.error');
        assert.equal(errorEntry.Logger, 'taskcluster.test.api');
        assert.equal(errorEntry.Fields.message, 'X-hub-signature does not match');
        assert.equal(errorEntry.Fields.xHubSignature, request.headers['X-Hub-Signature-256'] || request.headers['X-Hub-Signature']);
        assert.equal(errorEntry.Fields.event, request.headers['X-GitHub-Event']);
        assert.equal(errorEntry.Fields.eventId, request.headers['X-GitHub-Delivery']);
        assert.equal(errorEntry.Fields.installationId, request.body?.installation?.id);
        // clear errors
        monitor.manager.reset();
      }
      await check();
    });
  }

  // Good data: should all return 200 responses
  statusTest('Pull Request Opened', 'webhook.pull_request.open.json', 204);
  statusTest('Pull Request Closed', 'webhook.pull_request.close.sha256.json', 204, TC_DEV_INSTALLATION_ID);
  statusTest('Push SHA1', 'webhook.push.json', 204);
  statusTest('Push SHA256', 'webhook.push.sha256.json', 204, TC_DEV_INSTALLATION_ID);
  statusTest('Push wrong signature', 'webhook.push.bad_signature.json', 403, TC_DEV_INSTALLATION_ID);
  statusTest('Push skip ci', 'webhook.push.skip-ci.json', 200);
  statusTest('Release', 'webhook.release.json', 204);
  statusTest('Tag', 'webhook.tag_push.json', 204);
  statusTest('CheckRun rerun', 'webhook.check_run.rerequested.json', 204);
  statusTest('CheckRun rerun by bot', 'webhook.check_run.rerequested-bot.json', 200);
  statusTest('Issue Comment edited', 'webhook.issue_comment.edited.json', 204, TC_DEV_INSTALLATION_ID);

  // skipped events
  statusTest('Issue Comment created', 'webhook.issue_comment.created.json', 200, TC_DEV_INSTALLATION_ID);
  statusTest('Issue Comment deleted', 'webhook.issue_comment.deleted.json', 200, TC_DEV_INSTALLATION_ID);

  // Also should have data in the db after this one
  statusTest('Installation', 'webhook.installation.json', 200, 11725878, async () => {
    const result = await helper.db.fns.get_github_integration('imbstack');
    assert.equal(result.length, 1);
    assert.equal(result[0].owner, 'imbstack');
    assert.equal(result[0].installation_id, 11725878);
  });

  // Bad data: should all return 400 responses
  statusTest('Push without secret', 'webhook.push.no_secret.json', 400);
  statusTest('Unknown Event', 'webhook.unknown_event.json', 400);
  statusTest('Push with bad secret', 'webhook.push.bad_secret.json', 403);
  statusTest('Release with bad secret', 'webhook.release.bad_secret.json', 403);
  statusTest('CheckRun created', 'webhook.check_run.created.json', 403);
  statusTest('Pull Request with incomplete repository data', 'webhook.pull_request.null_head_repo.json', 400);
});
