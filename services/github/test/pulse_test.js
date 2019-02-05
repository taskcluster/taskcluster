const helper = require('./helper');
const assert = require('assert');
const libUrls = require('taskcluster-lib-urls');

helper.secrets.mockSuite('pulse', ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withFakePublisher(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withServer(mock, skipping);

  let github = null;
  let publisher = null;

  setup(async function() {
    await helper.load('cfg');
    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());

    github = await helper.load('github');
    github.inst(5808).setUser({id: 14795478, email: 'someuser@github.com', username: 'TaskclusterRobot'});
    github.inst(5808).setUser({id: 18102552, email: 'anotheruser@github.com', username: 'owlishDeveloper'});

    publisher = await helper.load('publisher');
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
   *  tasks_for:    'the event type; for v1'
   *  branch:       'the head branch name; for v1'
   **/
  function pulseTest(params) {
    test(params.testName, async function() {
      let published = [];
      let fakePublish = event => {
        published.push(event);
      };
      publisher.on('message', fakePublish);

      // Trigger a pull-request message
      try {
        let res = await helper.jsonHttpRequest('./test/data/webhooks/' + params.jsonFile);
        res.connection.destroy();
      } finally {
        publisher.removeListener('message', fakePublish);
      }

      let expected = [{
        exchange: `exchange/taskcluster-fake/v1/${params.listenFor}`,
        routingKey: params.routingKey,
        payload: {
          organization: 'TaskclusterRobot',
          details: params.details,
          installationId: 5808,
          repository: 'hooks-testing',
          eventId: params.eventId,
          version: 1,
          body: require('./data/webhooks/' + params.jsonFile).body,
          tasks_for: params.tasks_for,
          branch: params.branch,
        },
        CCs: [],
      }];
      if (params.action) {
        expected[0].payload.action = params.action;
      }
      assert.deepEqual(published, expected);
    });
  }

  pulseTest({
    testName: 'Publish Pull Request',
    listenFor: 'pull-request',
    action: 'opened',
    exchangeFunc: 'pullRequest',
    routingKey: 'primary.TaskclusterRobot.hooks-testing.opened',
    eventId: '81254e00-d9c1-11e6-8964-748a671f0cee',
    details: {
      'event.base.ref': 'refs/heads/master',
      'event.base.repo.branch': 'master',
      'event.base.repo.name': 'hooks-testing',
      'event.base.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
      'event.base.sha': '55e752e3a914db81eee3f90260f7eb69b7169ada',
      'event.base.user.login': 'TaskclusterRobot',
      'event.head.ref': 'refs/heads/owlishDeveloper-patch-2',
      'event.head.repo.branch': 'owlishDeveloper-patch-2',
      'event.head.repo.name': 'hooks-testing',
      'event.head.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
      'event.head.sha': 'b12ead3c5f3499e34356c970e20d7858f1747542',
      'event.head.user.login': 'owlishDeveloper',
      'event.head.user.id': 18102552,
      'event.pullNumber': 36,
      'event.type': 'pull_request.opened',
      'event.head.user.email': 'anotheruser@github.com',
      'event.title': 'Update README.md',
    },
    jsonFile: 'webhook.pull_request.open.json',
    tasks_for: 'github-pull-request',
    branch: 'owlishDeveloper-patch-2',
  });

  pulseTest({
    testName: 'Publish Push',
    listenFor: 'push',
    exchangeFunc: 'push',
    routingKey: 'primary.TaskclusterRobot.hooks-testing',
    eventId: '9637a980-d8fb-11e6-9830-1244ca57c95f',
    details: {
      'event.base.ref': 'refs/heads/master',
      'event.base.repo.branch': 'master',
      'event.base.repo.name': 'hooks-testing',
      'event.base.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
      'event.base.sha': '7a257a6d139708a3188bf2e0cd1f15e466a88d0e',
      'event.base.user.login': 'owlishDeveloper',
      'event.head.ref': 'refs/heads/master',
      'event.head.repo.branch': 'master',
      'event.head.repo.name': 'hooks-testing',
      'event.head.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
      'event.head.sha': 'b79ce60be819cdc482c9c6a84dc3c457959aa66f',
      'event.head.user.login': 'owlishDeveloper',
      'event.head.user.id': 18102552,
      'event.type': 'push',
      'event.head.user.email': 'anotheruser@github.com',
    },
    jsonFile: 'webhook.push.json',
    tasks_for: 'github-push',
    branch: 'master',
  });

  pulseTest({
    testName: 'Publish Release',
    listenFor: 'release',
    exchangeFunc: 'release',
    routingKey: 'primary.TaskclusterRobot.hooks-testing',
    eventId: '2c81a200-cd36-11e6-9106-ad0d7be0e22e',
    details: {
      'event.type': 'release',
      'event.base.repo.branch': 'master',
      'event.head.user.login': 'TaskclusterRobot',
      'event.head.user.id': 14795478,
      'event.version': 'testing-789',
      'event.name': 'Testing 123',
      'event.head.repo.name': 'hooks-testing',
      'event.head.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
      'event.release.url': 'https://api.github.com/repos/TaskclusterRobot/hooks-testing/releases/5027516',
      'event.prerelease': false,
      'event.draft': false,
      'event.tar': 'https://api.github.com/repos/TaskclusterRobot/hooks-testing/tarball/testing-789',
      'event.zip': 'https://api.github.com/repos/TaskclusterRobot/hooks-testing/zipball/testing-789',
      'event.head.user.email': 'someuser@github.com',
    },
    jsonFile: 'webhook.release.json',
    tasks_for: 'github-release',
    branch: 'master',
  });

  pulseTest({
    testName: 'Publish Tag Push',
    listenFor: 'push',
    exchangeFunc: 'push',
    routingKey: 'primary.TaskclusterRobot.hooks-testing',
    eventId: '9637a980-d8fb-11e6-9830-1244ca57c95f',
    details: {
      'event.base.ref': 'refs/tags/v1.0.2',
      'event.base.repo.name': 'hooks-testing',
      'event.base.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
      'event.base.sha': '0000000000000000000000000000000000000000',
      'event.base.user.login': 'owlishDeveloper',
      'event.head.ref': 'refs/tags/v1.0.2',
      'event.head.tag': 'v1.0.2',
      'event.head.repo.name': 'hooks-testing',
      'event.head.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
      'event.head.sha': 'b79ce60be819cdc482c9c6a84dc3c457959aa66f',
      'event.head.user.login': 'owlishDeveloper',
      'event.head.user.id': 18102552,
      'event.type': 'tag',
      'event.head.user.email': 'anotheruser@github.com',
    },
    jsonFile: 'webhook.tag_push.json',
    tasks_for: 'github-push',
    branch: 'v1.0.2',
  });
});
