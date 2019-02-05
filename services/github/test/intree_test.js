const fs = require('fs');
const assert = require('assert');
const _ = require('lodash');
const helper = require('./helper');
const libUrls = require('taskcluster-lib-urls');

suite('intree config', function() {
  let intree;

  suiteSetup(async function() {
    helper.load.save();
    await helper.load('cfg');
    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
    intree = await helper.load('intree');
  });

  suiteTeardown(function() {
    helper.load.restore();
  });

  /**
   * Test github data, like one would see in a pulse message
   * after a pull request
   **/
  function buildMessage(params) {
    let defaultMessage = {
      organization: 'testorg',
      repository: 'testrepo',
      details: {
        'event.pullNumber': 'eventData.number',
        'event.type': 'pull_request.opened',
        'event.base.user.login': 'eventData.pull_request.base.user.login',
        'event.base.repo.name': 'eventData.pull_request.base.repo.name',
        'event.base.repo.url': 'eventData.pull_request.base.repo.clone_url',
        'event.base.repo.branch': 'default_branch',
        'event.base.sha': 'eventData.pull_request.base.sha',
        'event.base.ref': 'eventData.pull_request.base.ref',
        'event.head.user.login': 'eventData.pull_request.head.user.login',
        'event.head.repo.name': 'eventData.pull_request.head.repo.name',
        'event.head.repo.url': 'eventData.pull_request.head.repo.clone_url',
        'event.head.repo.branch': 'eventData.pull_request.head.default_branch',
        'event.head.sha': 'eventData.pull_request.head.sha',
        'event.head.ref': 'eventData.pull_request.head.ref',
        'event.head.user.email': 'test@test.com',
      },
    };
    return _.merge(defaultMessage, params);
  }

  /**
   * Make sure that data merges properly when building configs
   * testName:    '', A label for the current test case
   * configPath:  '', Path to a taskclusterConfig file
   * params:      {
   *                payload:    {}, WebHook message payload
   *              }
   * count:       number of tasks to expect
   * expected:    {}, keys=>values expected to exist in the compiled config
   * shouldError: if you want intree to throw an exception, set this to true
   **/
  let buildConfigTest = function(testName, configPath, params, expected, count=-1, shouldError=false) {
    test(testName, async function() {
      params.config = fs.readFileSync(configPath);
      params.schema = {
        0: libUrls.schema(libUrls.testRootUrl(), 'github', 'v1/taskcluster-github-config.yml'),
        1: libUrls.schema(libUrls.testRootUrl(), 'github', 'v1/taskcluster-github-config.v1.yml'),
      };
      let config;
      try {
        config = intree(params);
      } catch (e) {
        if (shouldError) {
          return;
        }
        throw e;
      }
      if (shouldError) {
        throw new Error('This intree call should have failed!');
      }
      if (count > 0) {
        assert.equal(config.tasks.length, count);
      }
      for (let key of Object.keys(expected)) {
        assert.deepEqual(_.get(config, key), expected[key]);
      }
    });
  };

  let configPath = 'test/data/configs/';

  buildConfigTest(
    'Single Task Config, v0',
    configPath + 'taskcluster.single.v0.yml',
    {
      payload: buildMessage(),
    },
    {
      tasks: [], // The github event doesn't match, so no tasks are created
      'metadata.owner': 'test@test.com',
    });

  buildConfigTest(
    'Push Event, Single Task Config, v0',
    configPath + 'taskcluster.single.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'push'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['push'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:default_branch'],
    });

  buildConfigTest(
    'Push Event (Push Task + Pull Task + Release Task), v0',
    configPath + 'taskcluster.push_pull_release.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'push'}}),
    },
    {
      'metadata.owner': 'test@test.com',
      'tasks[0].task.payload.command': ['test'],
      'tasks[0].task.extra.github.events': ['push'],
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:default_branch'],
    });

  buildConfigTest(
    'Pull Event (Push Task + Pull Task + Release Task), v0',
    configPath + 'taskcluster.push_pull_release.v0.yml',
    {
      payload: buildMessage(),
    },
    {
      'metadata.owner': 'test@test.com',
      'tasks[0].task.payload.command': ['test'],
      'tasks[0].task.extra.github.events': ['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'],
      scopes: ['assume:repo:github.com/testorg/testrepo:pull-request'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, Branch Limited (on branch), v0',
    configPath + 'taskcluster.branchlimited.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'push', 'event.base.repo.branch': 'master'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['push'],
      'tasks[0].task.extra.github.branches': ['master'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:master'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, Branch Limited (off branch), v0',
    configPath + 'taskcluster.branchlimited.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'push', 'event.base.repo.branch': 'foobar'}}),
    },
    {
      tasks: [],
    });

  buildConfigTest(
    'Push Event, Single Task Config, Branch Excluded (on branch), v0',
    configPath + 'taskcluster.exclude.yml',
    {
      payload: buildMessage({details: {'event.type': 'push', 'event.base.repo.branch': 'foobar'}}),
    },
    {
      tasks: [],
    });

  buildConfigTest(
    'Pull Request Event, Single Task Config, Branch Excluded (on branch), v0',
    configPath + 'taskcluster.pull_with_exclude.yml',
    {
      payload: buildMessage({details: {'event.type': 'pull_request.opened', 'event.base.repo.branch': 'master'}}),
    },
    {
    },
    1);

  buildConfigTest(
    'Push Event, Single Task Config, Branch Exclude and Include errors, v0',
    configPath + 'taskcluster.exclude-error.yml',
    {
      payload: buildMessage({details: {'event.type': 'push', 'event.base.repo.branch': 'master'}}),
    },
    {
    },
    0,
    'should-error');

  buildConfigTest(
    'Star Pull Config, v0',
    configPath + 'taskcluster.star.yml',
    {
      payload: buildMessage(),
    },
    {
      'tasks[0].task.extra.github.events': ['pull_request.*'],
      'metadata.owner': 'test@test.com',
    });

  buildConfigTest(
    'Release Event, Single Task Config, v0',
    configPath + 'taskcluster.release_single.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'release'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['release'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:release'],
    });

  buildConfigTest(
    'Release Event (Push Task + Pull Task + Release Task), v0',
    configPath + 'taskcluster.push_pull_release.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'release'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['release'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:release'],
    });

  buildConfigTest(
    'No extra or extra.github generates an empty config, v0',
    configPath + 'taskcluster.non-github.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'release'}}),
    },
    {},
    0);

  buildConfigTest(
    'Unicode branch names are not allowed, v0',
    configPath + 'taskcluster.single.v0.yml',
    {
      payload: buildMessage({details: {'event.base.repo.branch': '🌱', 'event.type': 'push'}}),
    },
    {},
    0,
    true);

  buildConfigTest(
    'Tag Event, Single Task Config, v0',
    configPath + 'taskcluster.tag_single.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'tag', 'event.head.tag': 'v1.0.2'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['tag'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:tag:v1.0.2'],
    });

  buildConfigTest(
    'Tag Event, Single Task Config, Branch Limited (off branch), v0',
    configPath + 'taskcluster.tag.branchlimited.v0.yml',
    {
      payload: buildMessage({details: {'event.type': 'tag', 'event.head.tag': 'v1.0.2'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['tag'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:tag:v1.0.2'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, v1',
    configPath + 'taskcluster.single.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'push'},
        body: require('./data/webhooks/webhook.push.json').body,
        tasks_for: 'github-push',
        branch: 'master',
      }),
    },
    {
      'tasks[0].task.metadata.owner': '', // private email
      'tasks[0].task.metadata.source': 'https://github.com/TaskclusterRobot/hooks-testing',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:default_branch'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, v1',
    configPath + 'taskcluster.single.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'push'},
        body: require('./data/webhooks/webhook.push.json').body,
        tasks_for: 'github-push',
        branch: 'master',
      }),
    },
    {
      'tasks[0].task.metadata.owner': '', // private email
      'tasks[0].task.metadata.source': 'https://github.com/TaskclusterRobot/hooks-testing',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:default_branch'],
    });

  buildConfigTest(
    'Push Event (Push Task + Pull Task + Release Task), v1',
    configPath + 'taskcluster.push_pull_release.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'push'},
        body: require('./data/webhooks/webhook.push.json').body,
        tasks_for: 'github-push',
        branch: 'master',
      }),
    },
    {
      'tasks[0].task.metadata.owner': 'test@test.com',
      'tasks[0].task.metadata.source': 'http://mrrrgn.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:default_branch'],
    });

  buildConfigTest(
    'Pull Event (Push Task + Pull Task + Release Task), v1',
    configPath + 'taskcluster.push_pull_release.v1.yml',
    {
      payload: buildMessage({
        body: require('./data/webhooks/webhook.pull_request.open.json').body,
        tasks_for: 'github-pull-request',
        branch: 'owlishDeveloper-patch-2',
      }),
    },
    {
      'tasks[0].task.metadata.owner': 'test@test.com',
      'tasks[0].task.metadata.source': 'http://mrrrgn.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:pull-request'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, Branch Limited (on branch), v1',
    configPath + 'taskcluster.branchlimited.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'push', 'event.base.repo.branch': 'master'},
        body: require('./data/webhooks/webhook.push.json').body,
        tasks_for: 'github-push',
        branch: 'master',
      }),
    },
    {
      'tasks[0].task.metadata.owner': 'test@test.com',
      'tasks[0].task.metadata.source': 'http://mrrrgn.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:master'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, Branch Limited (off branch), v1',
    configPath + 'taskcluster.branchlimited.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'push', 'event.base.repo.branch': 'foobar'},
        body: require('./data/webhooks/webhook.push.offbranch.json').body,
        tasks_for: 'github-push',
        branch: 'foobar',
      }),
    },
    {
      tasks: [],
    });

  buildConfigTest(
    'Release Event, Single Task Config, v1',
    configPath + 'taskcluster.release_single.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'release'},
        body: require('./data/webhooks/webhook.release.json').body,
        tasks_for: 'github-release',
        branch: 'master',
      }),
    },
    {
      'tasks[0].task.metadata.owner': 'test@test.com',
      'tasks[0].task.metadata.source': 'http://mrrrgn.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:release'],
    });

  buildConfigTest(
    'Release Event (Push Task + Pull Task + Release Task), v1',
    configPath + 'taskcluster.push_pull_release.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'release'},
        body: require('./data/webhooks/webhook.release.json').body,
        tasks_for: 'github-release',
        branch: 'master',
      }),
    },
    {
      'tasks[0].task.metadata.owner': 'test@test.com',
      'tasks[0].task.metadata.source': 'http://mrrrgn.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:release'],
    });

  buildConfigTest(
    'Unicode branch names are not allowed, v1',
    configPath + 'taskcluster.single.v1.yml',
    {
      payload: buildMessage({
        details: {'event.base.repo.branch': '🌱', 'event.type': 'push'},
        body: require('./data/webhooks/webhook.push.unicode.json').body,
        tasks_for: 'github-push',
        branch: '🌱',
      }),
    },
    {},
    0,
    true);

  buildConfigTest(
    'Tag Event, Single Task Config, v1',
    configPath + 'taskcluster.tag_single.v1.yml',
    {
      payload: buildMessage({
        details: {'event.type': 'tag', 'event.head.tag': 'v1.0.2'},
        body: require('./data/webhooks/webhook.tag_push.json').body,
        tasks_for: 'github-push',
      }),
    },
    {
      'tasks[0].task.metadata.owner': 'test@test.com',
      'tasks[0].task.metadata.source': 'http://mrrrgn.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:tag:v1.0.2'],
    });
});
