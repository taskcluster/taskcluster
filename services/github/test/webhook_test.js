const fs = require('fs');
const helper = require('./helper');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  let github = null;
  let monitor;

  setup(async function() {
    github = await helper.load('github');
    github.inst(5808).setUser({id: 14795478, email: 'someuser@github.com', username: 'TaskclusterRobot'});
    github.inst(5808).setUser({id: 18102552, email: 'anotheruser@github.com', username: 'owlishDeveloper'});
    monitor = await helper.load('monitor');
  });

  // Check the status code returned from a request containing some test data
  function statusTest(testName, jsonFile, statusCode) {
    test(testName, async function() {
      const filename = './test/data/webhooks/' + jsonFile;
      let request = JSON.parse(fs.readFileSync(filename));
      let response = await helper.jsonHttpRequest(filename);
      assert.equal(response.statusCode, statusCode);
      response.connection.destroy();
      if (statusCode < 300) {
        assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'webhook-received'), {
          Type: 'webhook-received',
          Logger: 'taskcluster.test.api',
          Fields: {
            eventId: request.headers['X-GitHub-Delivery'],
            eventType: request.headers['X-GitHub-Event'],
            installationId: 5808,
            v: 1,
          },
          Severity: LEVELS.notice,
        });
      }
    });
  }

  // Good data: should all return 200 responses
  statusTest('Pull Request Opened', 'webhook.pull_request.open.json', 204);
  statusTest('Pull Request Closed', 'webhook.pull_request.close.json', 204);
  statusTest('Push', 'webhook.push.json', 204);
  statusTest('Release', 'webhook.release.json', 204);
  statusTest('Tag', 'webhook.tag_push.json', 204);

  // Bad data: should all return 400 responses
  statusTest('Push without secret', 'webhook.push.no_secret.json', 400);
  statusTest('Unknown Event', 'webhook.unknown_event.json', 400);
  statusTest('Push with bad secret', 'webhook.push.bad_secret.json', 403);
  statusTest('Release with bad secret', 'webhook.release.bad_secret.json', 403);
});
