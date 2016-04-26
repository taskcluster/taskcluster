suite('TaskCluster-GitHub-Integration', () => {
  let helper = require('./helper');
  let assert = require('assert');

  /**
   * Run a test which verifies that pulse messages are being produced
   * for valid webhook requests.
   * params: {
   *  testName:     'some test',
   *  listenFor:    'some event type',
   *  exchangeFunc: 'name of exchange function',
   *  routingKey:   {...}, a dict containing a pulse routing key
   *  details:      {...}, a dict of details we expect to seein the msg payload
   *  jsonFile:     'data file'
   **/
  function pulseTest (params) {
    test(params.testName, async () => {
      // Start listening for message
      await helper.events.listenFor(params.listenFor,
        helper.taskclusterGithubEvents[params.exchangeFunc](params.routingKey)
      );

      // Trigger a pull-request message
      let res = await helper.jsonHttpRequest('./test/data/webhooks/' + params.jsonFile);
      res.connection.destroy();
      // Wait for message and validate details
      let m = await helper.events.waitFor(params.listenFor);
      assert.equal(m.payload.organization, params.routingKey.organization);
      assert.equal(m.payload.repository, params.routingKey.repository);
      for (let key of Object.keys(params.details)) {
        assert.equal(m.payload.details[key], params.details[key]);
      }
    });
  };

  if (helper.canRunIntegrationTests) {
    pulseTest({
      testName:     'Publish Pull Request',
      listenFor:    'pull-request',
      exchangeFunc: 'pullRequest',
      routingKey:   {
        organization: 'ninethings',
        repository:   'website',
        action:       'opened',
      },
      details:      {},
      jsonFile:     'webhook.pull_request.open.json',
    });

    pulseTest({
      testName:     'Publish Push',
      listenFor:    'push',
      exchangeFunc: 'push',
      routingKey:   {
        organization: 'ninethings',
        repository:   'website',
      },
      details:      {
        'event.head.ref': 'refs/heads/master',
        'event.head.repo.branch': 'master',
        'event.base.repo.branch': 'master',
      },
      jsonFile:     'webhook.push.json',
    });

    pulseTest({
      testName:     'Publish Push With Dots In Name',
      listenFor:    'push',
      exchangeFunc: 'push',
      routingKey:   {
        organization: 'ninethings',
        repository:   'website%test',
      },
      details:      {},
      jsonFile:     'webhook.push.dots_in_name.json',
    });
  };
});
