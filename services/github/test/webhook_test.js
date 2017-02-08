suite('webhook', () => {
  let helper = require('./helper');
  let assert = require('assert');

  let github = null;

  setup(async () => {
    github = await helper.load('github');
    github.inst(5808).setUser({id: 14795478, email: 'someuser@github.com'});
    github.inst(5808).setUser({id: 18102552, email: 'anotheruser@github.com'});
  });

  // Check the status code returned from a request containing some test data
  function statusTest(testName, jsonFile, statusCode) {
    test(testName, async () => {
      let response = await helper.jsonHttpRequest('./test/data/webhooks/' + jsonFile);
      assert.equal(response.statusCode, statusCode);
      response.connection.destroy();
    });
  };

  // Good data: should all return 200 responses
  statusTest('Pull Request Opened', 'webhook.pull_request.open.json', 204);
  statusTest('Pull Request Closed', 'webhook.pull_request.close.json', 204);
  statusTest('Push', 'webhook.push.json', 204);
  statusTest('Release', 'webhook.release.json', 204);

  // Bad data: should all return 400 responses
  statusTest('Push without secret', 'webhook.push.no_secret.json', 400);
  statusTest('Unknown Event', 'webhook.unknown_event.json', 400);
  statusTest('Push with bad secret', 'webhook.push.bad_secret.json', 403);
  statusTest('Release with bad secret', 'webhook.release.bad_secret.json', 403);
});
