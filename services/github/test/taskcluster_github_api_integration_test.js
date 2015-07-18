suite("TaskCluster-GitHub-Integration", () => {
  var helper = require('./helper');
  var assert = require('assert');

  // Run a test which verifies that pulse messages are being produced
  // for valid webhook requests.
  function pulseTest(testName, listenFor, exchangeFunc, routingKey, jsonFile) {
    test(testName, async () => {
      // Start listening for message
      await helper.events.listenFor(listenFor,
        helper.taskclusterGithubEvents[exchangeFunc](routingKey)
      );

      // Trigger a pull-request message
      let res = await helper.jsonHttpRequest('./test/data/' + jsonFile)
      res.connection.destroy()
      // Wait for message and validate details
      var m = await helper.events.waitFor(listenFor);
      assert.equal(m.payload.organization, routingKey.organization);
      assert.equal(m.payload.repository, routingKey.repository);
    });
  };

  if (helper.canRunIntegrationTests) {
    pulseTest('Publish Pull Request',
      'pull-request',
      'pullRequest',
      {
        organization: 'ninethings',
        repository:   'website',
        action:           'opened'
      },
      'webhook.pull_request.open.json'
    );

    pulseTest('Publish Push',
      'push',
      'push',
      {
        organization: 'ninethings',
        repository:   'website',
      },
      'webhook.push.json'
    );

    pulseTest('Publish Push With Dots In Name',
      'push',
      'push',
      {
        organization: 'ninethings',
        repository:   'website%test',
      },
      'webhook.push.dots_in_name.json'
    );
  };
});
