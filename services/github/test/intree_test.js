suite('intree config', () => {
  let fs = require('fs');
  let assert = require('assert');
  let _ = require('lodash');
  let helper = require('./helper');

  /**
   * Test github data, like one would see in a pulse message
   * after a pull request
   **/
  function buildMessage(params) {
    let defaultMessage = {
      organization: 'testorg',
      repository:   'testrepo',
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
  };

  /**
   * Make sure that data merges properly when building configs
   * testName:    '', A label for the current test case
   * configPath:  '', Path to a taskclusterConfig file
   * params:      {
   *                payload:    {}, WebHook message payload
   *                validator:  {}, A taskcluster.base validator
   *              }
   * count:       number of tasks to expect
   * expected:    {}, keys=>values expected to exist in the compiled config
   **/
  let buildConfigTest = function(testName, configPath, params, expected, count=-1) {
    test(testName, async () => {
      params.config = fs.readFileSync(configPath);
      params.schema = 'http://schemas.taskcluster.net/github/v1/taskcluster-github-config.json#';
      params.validator = helper.validator;
      let config = helper.intree(params);
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
    'Single Task Config',
    configPath + 'taskcluster.single.yml',
    {
      payload:    buildMessage(),
    },
    {
      tasks: [], // The github event doesn't match, so no tasks are created
      'metadata.owner': 'test@test.com',
    });

  buildConfigTest(
    'Pull Event, Single Task Config',
    configPath + 'taskcluster.single.yml',
    {
      payload:    buildMessage({details: {'event.type': 'push'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['push'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:default_branch'],
    });

  buildConfigTest(
    'Push Event (Push Task + Pull Task + Release Task)',
    configPath + 'taskcluster.push_pull_release.yml',
    {
      payload:    buildMessage({details: {'event.type': 'push'}}),
    },
    {
      'metadata.owner': 'test@test.com',
      'tasks[0].task.payload.command': ['test'],
      'tasks[0].task.extra.github.events': ['push'],
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:default_branch'],
    });

  buildConfigTest(
    'Pull Event (Push Task + Pull Task + Release Task)',
    configPath + 'taskcluster.push_pull_release.yml',
    {
      payload:    buildMessage(),
    },
    {
      'metadata.owner': 'test@test.com',
      'tasks[0].task.payload.command': ['test'],
      'tasks[0].task.extra.github.events': ['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'],
      scopes: ['assume:repo:github.com/testorg/testrepo:pull-request'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, Branch Limited (on branch)',
    configPath + 'taskcluster.branchlimited.yml',
    {
      payload:    buildMessage({details: {'event.type': 'push', 'event.base.repo.branch': 'master'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['push'],
      'tasks[0].task.extra.github.branches': ['master'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:branch:master'],
    });

  buildConfigTest(
    'Push Event, Single Task Config, Branch Limited (off branch)',
    configPath + 'taskcluster.branchlimited.yml',
    {
      payload:    buildMessage({details: {'event.type': 'push', 'event.base.repo.branch': 'foobar'}}),
    },
    {
      tasks: [],
    });

  buildConfigTest(
    'Star Pull Config',
    configPath + 'taskcluster.star.yml',
    {
      payload:    buildMessage(),
    },
    {
      'tasks[0].task.extra.github.events': ['pull_request.*'],
      'metadata.owner': 'test@test.com',
    });

  buildConfigTest(
    'Release Event, Single Task Config',
    configPath + 'taskcluster.release_single.yml',
    {
      payload:    buildMessage({details: {'event.type': 'release'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['release'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:release'],
    });

  buildConfigTest(
    'Release Event (Push Task + Pull Task + Release Task)',
    configPath + 'taskcluster.push_pull_release.yml',
    {
      payload:    buildMessage({details: {'event.type': 'release'}}),
    },
    {
      'tasks[0].task.extra.github.events': ['release'],
      'metadata.owner': 'test@test.com',
      scopes: ['assume:repo:github.com/testorg/testrepo:release'],
    });

  buildConfigTest(
    'No extra or extra.github generates an empty config',
    configPath + 'taskcluster.non-github.yml',
    {
      payload:    buildMessage({details: {'event.type': 'release'}}),
    },
    {},
    0);
});
