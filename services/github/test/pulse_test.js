suite('pulse', () => {
  let helper = require('./helper');
  let assert = require('assert');
  let _ = require('lodash');

  let github = null;

  setup(async () => {
    github = await helper.load('github');
    github.inst(5808).setUser({id: 14795478, email: 'someuser@github.com'});
    github.inst(5808).setUser({id: 18102552, email: 'anotheruser@github.com'});
  });

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
  function pulseTest(params) {
    test(params.testName, async () => {
      let published = [];
      let fakePublish = event => published.push(event);
      helper.publisher.on('fakePublish', fakePublish);

      // Trigger a pull-request message
      try {
        let res = await helper.jsonHttpRequest('./test/data/webhooks/' + params.jsonFile);
        res.connection.destroy();
      } finally {
        helper.publisher.removeListener('fakePublish', fakePublish);
      }

      let expected = [{
        exchange: `v1/${params.listenFor}`,
        routingKey: params.routingKey,
        payload: { 
          organization: 'TaskClusterRobot',
          details: params.details,
          installationId: 5808,
          repository: 'hooks-testing',
          eventId: params.eventId,
          version: 1,
        },
        CCs: [],
      }];
      if (params.action) {
        expected[0].payload.action = params.action;
      }
      assert.deepEqual(published, expected);
    });
  };

  pulseTest({
    testName: 'Publish Pull Request',
    listenFor: 'pull-request',
    action: 'opened',
    exchangeFunc: 'pullRequest',
    routingKey: 'primary.TaskClusterRobot.hooks-testing.opened',
    eventId: '81254e00-d9c1-11e6-8964-748a671f0cee',
    details: {
      'event.base.ref': 'refs/heads/master',
      'event.base.repo.branch': 'master',
      'event.base.repo.name': 'hooks-testing',
      'event.base.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
      'event.base.sha': '55e752e3a914db81eee3f90260f7eb69b7169ada',
      'event.base.user.login': 'TaskClusterRobot',
      'event.head.ref': 'refs/heads/owlishDeveloper-patch-2',
      'event.head.repo.branch': 'owlishDeveloper-patch-2',
      'event.head.repo.name': 'hooks-testing',
      'event.head.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
      'event.head.sha': 'b12ead3c5f3499e34356c970e20d7858f1747542',
      'event.head.user.login': 'owlishDeveloper',
      'event.head.user.id': 18102552,
      'event.pullNumber': 36,
      'event.type': 'pull_request.opened',
      'event.head.user.email': 'anotheruser@github.com',
    },
    jsonFile: 'webhook.pull_request.open.json',
  });

  pulseTest({
    testName:     'Publish Push',
    listenFor:    'push',
    exchangeFunc: 'push',
    routingKey:   'primary.TaskClusterRobot.hooks-testing',
    eventId: '9637a980-d8fb-11e6-9830-1244ca57c95f',
    details:      {
      'event.base.ref': 'refs/heads/master',
      'event.base.repo.branch': 'master',
      'event.base.repo.name': 'hooks-testing',
      'event.base.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
      'event.base.sha': '7a257a6d139708a3188bf2e0cd1f15e466a88d0e',
      'event.base.user.login': 'owlishDeveloper',
      'event.head.ref': 'refs/heads/master',
      'event.head.repo.branch': 'master',
      'event.head.repo.name': 'hooks-testing',
      'event.head.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
      'event.head.sha': 'b79ce60be819cdc482c9c6a84dc3c457959aa66f',
      'event.head.user.login': 'owlishDeveloper',
      'event.head.user.id': 18102552,
      'event.type': 'push',
      'event.head.user.email': 'anotheruser@github.com',
    },
    jsonFile:     'webhook.push.json',
  });

  pulseTest({
    testName:     'Publish Release',
    listenFor:    'release',
    exchangeFunc: 'release',
    routingKey: 'primary.TaskClusterRobot.hooks-testing',
    eventId: '2c81a200-cd36-11e6-9106-ad0d7be0e22e',
    details:      {
      'event.type': 'release',
      'event.base.repo.branch': 'master',
      'event.head.user.login': 'TaskClusterRobot',
      'event.head.user.id': 14795478,
      'event.version': 'testing-789',
      'event.name': 'Testing 123',
      'event.head.repo.name': 'hooks-testing',
      'event.head.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
      'event.release.url': 'https://api.github.com/repos/TaskClusterRobot/hooks-testing/releases/5027516',
      'event.prerelease': false,
      'event.draft': false,
      'event.tar': 'https://api.github.com/repos/TaskClusterRobot/hooks-testing/tarball/testing-789',
      'event.zip': 'https://api.github.com/repos/TaskClusterRobot/hooks-testing/zipball/testing-789',
      'event.head.user.email': 'someuser@github.com',
    },
    jsonFile:     'webhook.release.json',
  });
});
