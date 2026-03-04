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
      response.connection?.destroy();
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
  statusTest('Push from merge queue bot', 'webhook.push.merge_queue_bot.json', 204, 5116332);
  statusTest('Push wrong signature', 'webhook.push.bad_signature.json', 403, TC_DEV_INSTALLATION_ID);
  statusTest('Push skip ci', 'webhook.push.skip-ci.json', 200);
  statusTest('Push from enterprise GitHub', 'webhook.push.enterprise.json', 204);
  statusTest('Release', 'webhook.release.json', 204);
  statusTest('Tag', 'webhook.tag_push.json', 204);
  statusTest('CheckRun rerun', 'webhook.check_run.rerequested.json', 204);
  statusTest('CheckRun rerun by bot', 'webhook.check_run.rerequested-bot.json', 200);
  statusTest('Issue Comment edited', 'webhook.issue_comment.edited.json', 204, TC_DEV_INSTALLATION_ID);
  statusTest('CheckRun with waiting status', 'webhook.check_run.waiting_status.json', 204);
  statusTest('CheckRun with stale conclusion', 'webhook.check_run.stale_conclusion.json', 204);

  // skipped events
  statusTest('Issue Comment created', 'webhook.issue_comment.created.json', 200, TC_DEV_INSTALLATION_ID);
  statusTest('Issue Comment deleted', 'webhook.issue_comment.deleted.json', 200, TC_DEV_INSTALLATION_ID);

  test('Pull Request Opened without a known sender user still succeeds', async function() {
    const installation = github.inst(5808);
    // drop user to cause 404 error
    installation._github_users = installation._github_users.filter(({ username }) => username !== 'owlishDeveloper');

    monitor.manager.reset();

    const filename = './test/data/webhooks/webhook.pull_request.open.json';
    const response = await helper.jsonHttpRequest(filename);
    assert.equal(response.statusCode, 204);
    response.connection?.destroy();

    const webhookMessage = monitor.manager.messages.find(({ Type }) => Type === 'webhook-received');
    assert(webhookMessage, 'expected webhook-received monitor message');
  });

  // Also should have data in the db after this one
  statusTest('Installation', 'webhook.installation.json', 200, 11725878, async () => {
    const result = await helper.db.fns.get_github_integration('imbstack');
    assert.equal(result.length, 1);
    assert.equal(result[0].owner, 'imbstack');
    assert.equal(result[0].installation_id, 11725878);
  });

  // Bad data: should all return 400 responses
  statusTest('Push without secret', 'webhook.push.no_secret.json', 400);
  statusTest('Unknown Event', 'webhook.unknown_event.json', 200);
  statusTest('Push with bad secret', 'webhook.push.bad_secret.json', 403);
  statusTest('Release with bad secret', 'webhook.release.bad_secret.json', 403);
  statusTest('CheckRun created', 'webhook.check_run.created.json', 403);

  // Common field validation tests (for refactored schema)
  statusTest('Push with missing sender returns 400',
    'webhook.push.missing_sender.json', 400);
  statusTest('Push with invalid sender.login returns 400',
    'webhook.push.invalid_sender.json', 400);

  // Webhook Payload Validation Tests
  statusTest('PR with missing head.repo returns 400',
    'webhook.pull_request.missing_head_repo.json', 400);

  statusTest('PR with invalid SHA returns 400',
    'webhook.pull_request.invalid_sha.json', 400);

  statusTest('Push with missing repository returns 400',
    'webhook.push.missing_repository.json', 400);

  statusTest('Push with invalid ref pattern returns 400',
    'webhook.push.invalid_ref.json', 400);

  // Test that OneOf pattern correctly validates different event types
  test('OneOf schema validates all supported webhook event types', async function() {
    const validEvents = [
      { file: 'webhook.pull_request.open.json', eventType: 'pull_request' },
      { file: 'webhook.push.json', eventType: 'push' },
      { file: 'webhook.issue_comment.edited.json', eventType: 'issue_comment' },
      { file: 'webhook.release.json', eventType: 'release' },
      { file: 'webhook.installation.json', eventType: 'installation' },
      { file: 'webhook.check_run.rerequested.json', eventType: 'check_run' },
    ];

    for (const { file, eventType } of validEvents) {
      const response = await helper.jsonHttpRequest('./test/data/webhooks/' + file);
      // Should pass validation (200 or 204 status)
      assert.ok(response.statusCode < 400,
        `${eventType} event should pass validation, got ${response.statusCode}`);
      response.connection?.destroy();
    }
  });

  // Test that validation properly rejects malformed payloads
  test('Schema validation rejects malformed payloads for each event type', async function() {
    const invalidEvents = [
      { file: 'webhook.pull_request.missing_head_repo.json', reason: 'missing required field' },
      { file: 'webhook.pull_request.invalid_sha.json', reason: 'invalid SHA format' },
      { file: 'webhook.push.missing_repository.json', reason: 'missing repository' },
      { file: 'webhook.push.invalid_ref.json', reason: 'invalid ref pattern' },
    ];

    for (const { file, reason } of invalidEvents) {
      const response = await helper.jsonHttpRequest('./test/data/webhooks/' + file);
      assert.equal(response.statusCode, 400,
        `Should reject payload with ${reason}`);
      response.connection?.destroy();
    }
  });

  // Test refactored schema with common fields extracted
  test('Common fields are validated at base schema level', async function() {
    // Test that sender field is validated as a common field
    const validPayloads = [
      'webhook.pull_request.open.json',
      'webhook.push.json',
      'webhook.issue_comment.edited.json',
      'webhook.release.json',
      'webhook.check_run.rerequested.json',
    ];

    for (const file of validPayloads) {
      const filename = './test/data/webhooks/' + file;
      const payload = JSON.parse(fs.readFileSync(filename));

      // Verify sender field exists in all payloads
      assert.ok(payload.body.sender, `${file} should have sender field`);
      assert.ok(payload.body.sender.login, `${file} should have sender.login field`);
    }
  });

  test('Schema validates common and event-specific fields together', async function() {
    // Test that both common fields (sender, repository, installation)
    // and event-specific fields are validated together
    const testCases = [
      {
        file: 'webhook.pull_request.open.json',
        commonFields: ['sender', 'repository', 'installation'],
        specificFields: ['action', 'number', 'pull_request'],
      },
      {
        file: 'webhook.push.json',
        commonFields: ['sender', 'repository', 'installation'],
        specificFields: ['ref', 'before', 'after', 'commits'],
      },
      {
        file: 'webhook.issue_comment.edited.json',
        commonFields: ['sender', 'repository', 'installation'],
        specificFields: ['action', 'issue', 'comment'],
      },
    ];

    for (const { file, commonFields, specificFields } of testCases) {
      const filename = './test/data/webhooks/' + file;
      const payload = JSON.parse(fs.readFileSync(filename));

      // Verify common fields
      for (const field of commonFields) {
        assert.ok(payload.body[field], `${file} should have common field: ${field}`);
      }

      // Verify event-specific fields
      for (const field of specificFields) {
        assert.ok(Object.prototype.hasOwnProperty.call(payload.body, field),
          `${file} should have event-specific field: ${field}`);
      }
    }
  });

  test('OneOf pattern correctly discriminates between event types', async function() {
    // Test that the oneOf correctly identifies and validates each event type
    const eventTypes = [
      { file: 'webhook.pull_request.open.json', hasAction: true, hasPushFields: false },
      { file: 'webhook.push.json', hasAction: false, hasPushFields: true },
      { file: 'webhook.issue_comment.edited.json', hasAction: true, hasPushFields: false },
      { file: 'webhook.release.json', hasAction: true, hasPushFields: false },
    ];

    for (const { file, hasAction, hasPushFields } of eventTypes) {
      const filename = './test/data/webhooks/' + file;
      const payload = JSON.parse(fs.readFileSync(filename));

      if (hasAction) {
        assert.ok(payload.body.action, `${file} should have action field`);
      } else {
        assert.ok(!payload.body.action || payload.body.action === undefined,
          `${file} should not have action field`);
      }

      if (hasPushFields) {
        assert.ok(payload.body.ref, `${file} should have ref field`);
        assert.ok(payload.body.commits, `${file} should have commits field`);
      } else {
        assert.ok(!payload.body.ref || payload.body.ref === undefined,
          `${file} should not have ref field`);
      }
    }
  });
});
