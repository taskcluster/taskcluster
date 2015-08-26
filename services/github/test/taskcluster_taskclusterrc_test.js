suite('TaskCluster-Github taskclusterrc', () => {
  var fs     = require('fs');
  var tcrc   = require('../lib/taskclusterrc');
  var assert = require('assert');
  var _      = require('lodash');
  var common = require('../lib/common');
  var helper = require('./helper');

  /**
   * Test github data, like one would see in a pulse message
   * after a pull request
   **/
  function buildMessage(params) {
    let defaultMessage = {
      organization: 'testorg',
      repository:   'testrepo',
      details: {
        pullNumber: 'eventData.number',
        event: 'push',
        branch: 'eventData.pull_request.base.some_branch',
        baseUser: 'eventData.pull_request.base.user.login',
        baseRepoUrl: 'eventData.pull_request.base.repo.clone_url',
        baseBranch: 'eventData.pull_request.base.default_branch',
        baseSha: 'eventData.pull_request.base.sha',
        baseRef: 'eventData.pull_request.base.ref',
        headUser: 'eventData.pull_request.head.user.login',
        headRepoUrl: 'eventData.pull_request.head.repo.clone_url',
        headBranch: 'eventData.pull_request.head.default_branch',
        headSha: 'eventData.pull_request.head.sha',
        headRef: 'eventData.pull_request.head.ref',
        headUserEmail: 'test@test.com'
      }
    }
    return _.merge(defaultMessage, params);
  };

  /**
   * Test github data, relevant fields like one would receive from a call to:
   * https://developer.github.com/v3/orgs/
   **/
  function buildUserInfo(params) {
    let info = {
        orgs: [
          {login: 'testorg'}
        ]
      }
    return _.merge(info, params);
    };

  /**
   * Retrieve values from deeply nested objects.
   **/
  function getNestedValue(keys, obj) {
    let arrayExp = RegExp('\\[([0-9]+)\\]');
    keys = keys.split('.');
    for (let i in keys) {
      let arrayMatch = arrayExp.exec(keys[i]);
      if (arrayMatch) {
        // Here we handle array accesses of the form a.b[2]
        obj = obj[keys[i].split('[')[0]][arrayMatch[1]];
      } else {
        obj = obj[keys[i]];
      }
    }
    return obj;
  };

  /**
   * Make sure that data merges properly when building configs
   * testName:    '', A label for the current test case
   * configPath:  '', Path to a taskclusterrc file
   * params:      {
   *                payload:    {}, WebHook message payload
   *                userInfo:   {}, GitHub user info
   *                validator:  {}, A taskcluster.base validator
   *              }
   * expected:    {}, keys=>values expected to exist in the compiled config
   **/
  var buildConfigTest = function(testName, configPath, params, expected) {
    test(testName, async () => {
      params.taskclusterrc = fs.readFileSync(configPath);
      params.schema = common.SCHEMA_PREFIX_CONST + 'taskclusterrc.json#';
      params.validator = helper.validator;
      let config = await tcrc.processConfig(params);
      for (let key in expected) {
        assert.deepEqual(getNestedValue(key, config), expected[key]);
      }
    });
  };

  var configPath = 'test/data/';

  buildConfigTest(
    'Single Task Config',
    configPath + 'taskclusterrc.single.yml',
    {
      payload:    buildMessage(),
      userInfo:   buildUserInfo(),
    },
    {
      'tasks': [], // The github event doesn't match, so no tasks are created
      'metadata.owner': 'test@test.com'
    });

  buildConfigTest(
    'Pull Event, Single Task Config',
    configPath + 'taskclusterrc.single.yml',
    {
      payload:    buildMessage({details: {event: 'pull_request.synchronize'}}),
      userInfo:   buildUserInfo(),
    },
    {
      'tasks[0].task.extra.github_events': ['pull_request.opened', 'pull_request.synchronize'],
      'metadata.owner': 'test@test.com'
    });

  buildConfigTest(
    'Push Event (Push Task + Pull Task)',
    configPath + 'taskclusterrc.push_task_and_pull_task.yml',
    {
      payload:    buildMessage(),
      userInfo:   buildUserInfo(),
    },
    {
      'metadata.owner': 'test@test.com',
      'tasks[0].task.payload.command': ['test'],
      'tasks[0].task.extra.github_events': ['push']
    });

  buildConfigTest(
    'Pull Event (Push Task + Pull Task)',
    configPath + 'taskclusterrc.push_task_and_pull_task.yml',
    {
      payload:    buildMessage({details: {event: 'pull_request.opened'}}),
      userInfo:   buildUserInfo(),
    },
    {
      'metadata.owner': 'test@test.com',
      'tasks[0].task.payload.command': ['test'],
      'tasks[0].task.extra.github_events': ['pull_request.opened', 'pull_request.synchronize']
    });
});
