suite('TaskCluster-Github', () => {
  let helper = require('./helper');
  let assert = require('assert');

  // Check the status code returned from a request containing some test data
  function statusTest (testName, jsonFile, statusCode) {
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

  // Bad data: should all return 400 responses
  statusTest('Push without secret', 'webhook.push.no_secret.json', 400);
  statusTest('Unknown Event', 'webhook.unknown_event.json', 403);
  statusTest('Push with bad secret', 'webhook.push.bad_secret.json', 403);
});
