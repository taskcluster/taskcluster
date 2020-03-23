const debug = require('debug')('test');
const helper = require('./helper');
const assert = require('assert');
const sinon = require('sinon');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');
const taskcluster = require('taskcluster-client');
const {LEVELS} = require('taskcluster-lib-monitor');

/**
 * This tests the event handlers, faking out all of the services they
 * interact with.
 */
helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withPulse(mock, skipping);

  const URL_PREFIX = 'https://tc-tests.example.com/tasks/groups/';

  let github = null;
  let handlers = null;

  async function addBuild({state, taskGroupId}) {
    debug(`adding Build row for ${taskGroupId} in state ${state}`);
    await helper.Builds.create({
      organization: 'TaskclusterRobot',
      repository: 'hooks-testing',
      sha: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
      taskGroupId,
      state,
      created: new Date(),
      updated: new Date(),
      installationId: 9988,
      eventType: 'push',
      eventId: 'aaa-bbb',
    });
  }

  async function addCheckRun({taskGroupId, taskId}) {
    debug(`adding CheckRun row for task ${taskId} of group ${taskGroupId}`);
    await helper.CheckRuns.create({
      taskGroupId,
      taskId,
      checkSuiteId: '11111',
      checkRunId: '22222',
    });
  }

  async function simulateExchangeMessage({taskGroupId, exchange, routingKey, taskId, state, reasonResolved}) {
    // set up to resolve when the handler has finished (even if it finishes with error)
    const handlerComplete = new Promise((resolve, reject) => {
      handlers.handlerComplete = resolve;
      handlers.handlerRejected = reject;
    });

    debug(`publishing ${JSON.stringify({taskGroupId, exchange})}`);
    const message = {
      exchange,
      routingKey,
      routes: [],
      payload: {
        status: {
          taskGroupId,
          taskId,
          state,
          runs: [{
            reasonResolved,
          }],
        },
        taskGroupId,
        runId: 0,
      },
    };

    await helper.fakePulseMessage(message);
    await handlerComplete;
  }

  setup(async function() {
    helper.load.save();

    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
    github = await helper.load('github');
    handlers = await helper.load('handlers');

    await handlers.setup();

    // stub out `createTasks` so that we don't actually create tasks
    handlers.realCreateTasks = handlers.createTasks;
    handlers.createTasks = sinon.stub();
    handlers.queueClient = {
      task: (_) => {
        return Promise.resolve({
          metadata: {
            name: 'Task Name',
            description: 'Task Description',
          },
        });
      },
      listTaskGroup: async () => ({tasks: []}),
    };

    // set up the allowPullRequests key
    github.inst(5828).setRepoInfo({
      owner: 'TaskclusterRobot',
      repo: 'hooks-testing',
      info: {default_branch: 'development'},
    });
  });

  teardown(async function() {
    await handlers.terminate();
    helper.load.restore();
  });

  suite('createTasks', function() {
    let createdTasks;

    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    setup(function() {
      createdTasks = [];

      handlers.queueClient = new taskcluster.Queue({
        rootUrl: 'https://tc.example.com',
        fake: {
          createTask: async (taskId, taskDef) => {
            if (taskId === 'fail') {
              const {message, ...errorProps} = taskDef;
              throw Object.assign(new Error(message), errorProps);
            }
            createdTasks.push(taskDef);
          },
        },
      });
    });

    test('does not call queue.createTask if given no tasks', async function() {
      await handlers.realCreateTasks({scopes: [], tasks: []});
      assert.equal(createdTasks.length, 0);
    });

    test('calls queue.createTask in order', async function() {
      await handlers.realCreateTasks({scopes: [], tasks: [
        {taskId: 'aa', task: {payload: 'a'}},
        {taskId: 'bb', task: {payload: 'b'}},
        {taskId: 'cc', task: {payload: 'c'}},
      ]});
      assert.deepEqual(createdTasks.map(({payload}) => payload), ['a', 'b', 'c']);
    });

    test('propagates unknown errors', async function() {
      await assert.rejects(
        handlers.realCreateTasks({scopes: [], tasks: [
          {taskId: 'fail', task: {message: 'uhoh'}},
        ]}),
        err => err.message === 'uhoh',
      );
    });

    test('handles InsufficientScopes errors', async function() {
      await assert.rejects(
        handlers.realCreateTasks({
          scopes: ['assume:repo:github.com/a/b:branch:master', 'queue:route:statuses'],
          tasks: [
            {
              taskId: 'fail',
              task: {
                message: 'Client ID project/taskcluster/tc-github/production-2 does not have sufficient scopes blah blah',
                code: 'InsufficientScopes',
              },
            },
          ],
        }),
        err => {
          if (err.code !== 'InsufficientScopes') {
            return false;
          }

          assert.equal(err.message, `\
            Taskcluster-GitHub attempted to create a task for this event with the following scopes:

            \`\`\`
            [
              "assume:repo:github.com/a/b:branch:master",
              "queue:route:statuses"
            ]
            \`\`\`

            The expansion of these scopes is not sufficient to create the task, leading to the following:

            Client ID project/taskcluster/tc-github/production-2 does not have sufficient scopes blah blah`
            .replace(/^ {12}/mg, ''));
          return true;
        },
      );
    });
  });

  suite('jobHandler', function() {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    // set any of the three important users for a PR:
    // opener -> pull_request.user.login (defaults to user)
    // headUser -> pull_request.head.user.login (defaults to user)
    // baseUser -> pull_request.base.user.login (defaults to hooks-testing)
    async function simulateJobMessage({user, opener, headUser, baseUser, head, base, eventType = 'push'}) {
      // set up to resolve when the handler has finished (even if it finishes with error)
      const handlerComplete = new Promise((resolve, reject) => {
        handlers.handlerComplete = resolve;
        handlers.handlerRejected = reject;
      });

      let body = {
        pull_request: {
          user: {
            login: opener || user || 'octocat',
          },
          head: {
            user: {
              login: headUser || user || 'octocat',
            },
          },
          base: {
            user: {
              login: baseUser || 'hooks-testing',
            },
          },
        },
      };

      let details = {
        'event.type': eventType,
        'event.base.repo.branch': 'tc-gh-tests',
        'event.head.repo.branch': 'tc-gh-tests',
        'event.head.user.login': user,
        'event.head.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
        'event.head.sha': head || '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        'event.head.ref': 'refs/heads/tc-gh-tests',
        'event.base.sha': base || '2bad4edf90e7d4fb4643456a4df333da348bbed4',
        'event.head.user.id': 190790,
      };
      if (eventType === 'tag') {
        details['event.head.tag'] = 'v1.0.2';
        delete details['event.head.repo.branch'];
        delete details['event.base.repo.branch'];
      }

      debug(`publishing ${JSON.stringify({user, head, base, eventType})}`);
      const [eventBase, eventAction] = eventType.split('.');
      const exchange = {
        // 'tag' events arrive on the 'push' exchange..
        tag: 'push',
        push: 'push',
        pull_request: 'pull-request',
        release: 'release',
      }[eventBase];
      const message = {
        exchange: `exchange/taskcluster-github/v1/${exchange}`,
        routingKey: eventBase === 'pull_request' ?
          `primary.TaskclusterRobot.hooks-testing.${eventAction}` :
          'primary.TaskclusterRobot.hooks-testing',
        routes: [],
        payload: {
          organization: 'TaskclusterRobot',
          details,
          repository: 'hooks-testing',
          eventId: '26370a80-ed65-11e6-8f4c-80082678482d',
          installationId: 5828,
          version: 1,
          body,
        },
      };
      if (eventBase === 'pull_request') {
        message.payload.details['event.pullNumber'] = 36;
      }

      await helper.fakePulseMessage(message);
      await handlerComplete;
    }

    test('tasks generated as non-list', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: {version: 1, tasks: {}},
      });
      await simulateJobMessage({user: 'TaskclusterRobot'});

      assert(github.inst(5828).repos.createCommitComment.calledOnce);
      let args = github.inst(5828).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(args[0][0].body.indexOf('tasks field  of .taskcluster.yml must be array of tasks or empty array') !== -1);
    });

    test('tasks generated as undefined is OK', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: {version: 1, tasks: undefined},
      });
      await simulateJobMessage({user: 'TaskclusterRobot'});

      assert(github.inst(5828).repos.createCommitComment.notCalled);
    });

    test('valid push (owner is collaborator) creates a taskGroup', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/valid-yaml.json'),
      });
      await simulateJobMessage({user: 'TaskclusterRobot'});

      assert(handlers.createTasks.calledWith({scopes: sinon.match.array, tasks: sinon.match.array}));
      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let build = await helper.Builds.load({taskGroupId});
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(build.state, 'pending');
    });

    test('valid pull_request (user is collaborator) creates a taskGroup', async function() {
      github.inst(5828).setRepoCollaborator({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        username: 'goodBuddy',
      });
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf', // HEAD
        content: require('./data/yml/valid-yaml.json'),
      });
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: require('./data/yml/valid-yaml.json'),
      });

      await simulateJobMessage({user: 'goodBuddy', eventType: 'pull_request.opened'});

      assert(handlers.createTasks.calledWith({scopes: sinon.match.array, tasks: sinon.match.array}));
      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let build = await helper.Builds.load({taskGroupId});
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(build.state, 'pending');
    });

    test('valid push (but not collaborator) creates a taskGroup', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/valid-yaml.json'),
      });
      await simulateJobMessage({user: 'TaskclusterCollaborator', eventType: 'push'});

      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let build = await helper.Builds.load({taskGroupId});
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(build.state, 'pending');
    });

    test('valid tag push (but not collaborator) creates a taskGroup', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/valid-yaml.json'),
      });
      await simulateJobMessage({
        user: 'TaskclusterRobotCollaborator',
        base: '0000000000000000000000000000000000000000',
        eventType: 'tag'},
      );

      assert(handlers.createTasks.calledWith({scopes: sinon.match.array, tasks: sinon.match.array}));
      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let build = await helper.Builds.load({taskGroupId});
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(build.state, 'pending');
    });

    test('invalid YAML results in a comment', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/invalid-yaml.json'),
      });
      await simulateJobMessage({user: 'TaskclusterRobot'});

      assert(github.inst(5828).repos.createStatus.callCount === 0, 'Status was unexpectedly updated!');
      assert(github.inst(5828).repos.createCommitComment.calledOnce);
      let args = github.inst(5828).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(args[0][0].body.indexOf('data should NOT have additional properties') !== -1);
    });

    test('error creating task is reported correctly', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/valid-yaml.json'),
      });
      handlers.createTasks.rejects({body: {error: 'oh noes'}});
      await simulateJobMessage({user: 'TaskclusterRobot'});

      assert(github.inst(5828).repos.createCommitComment.calledOnce);
      let args = github.inst(5828).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(args[0][0].body.indexOf('oh noes') !== -1);
    });

    suite('PR permissions (collaborators)', function() {
      const testPermissions = (name, {opener, headUser, succeed}) => {
        test(name, async function() {
          github.inst(5828).setRepoCollaborator({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            username: 'friendlyFace',
          });
          github.inst(5828).setRepoCollaborator({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            username: 'goodBuddy',
          });
          github.inst(5828).setTaskclusterYml({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
            content: require('./data/yml/valid-yaml.json'),
          });
          github.inst(5828).setTaskclusterYml({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            ref: 'development',
            content: {version: 0, allowPullRequests: 'collaborators'},
          });

          await simulateJobMessage({opener, headUser, baseUser: 'hooks-testing', eventType: 'pull_request.opened'});

          if (succeed) {
            assert(handlers.createTasks.calledWith({scopes: sinon.match.array, tasks: sinon.match.array}));
          } else {
            assert(github.inst(5828).issues.createComment.calledOnce);
            let args = github.inst(5828).issues.createComment.args;
            assert.equal(args[0][0].owner, 'TaskclusterRobot');
            assert.equal(args[0][0].repo, 'hooks-testing');
            assert.equal(args[0][0].number, '36');
            assert(args[0][0].body.indexOf('No Taskcluster jobs started for this pull request') !== -1);
          }
        });
      };

      testPermissions('all from bad guy', {opener: 'badguy', headUser: 'badguy', succeed: false});
      testPermissions('collaborator opens PR for non-collaborator', {opener: 'goodBuddy', headUser: 'badguy', succeed: false});
      testPermissions('non-collaborator opens PR for collaborator', {opener: 'badguy', headUser: 'goodBuddy', succeed: false});
      testPermissions('collaborator opens PR for self', {opener: 'goodBuddy', headUser: 'goodBuddy', succeed: true});
      testPermissions('collaborator opens PR for friendly face', {opener: 'goodBuddy', headUser: 'friendlyFace', succeed: true});
      testPermissions('collaborator opens PR for upstream repo', {opener: 'goodBuddy', headUser: 'hooks-testing', succeed: true});
      testPermissions('collaborator opens PR for another repo', {opener: 'goodBuddy', headUser: 'some-other-repo', succeed: false});
    });

    test('specifying allowPullRequests: public in the default branch allows all', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/valid-yaml.json'),
      });
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: {version: 0, allowPullRequests: 'public'},
      });
      await simulateJobMessage({user: 'imbstack', eventType: 'pull_request.opened'});

      assert(github.inst(5828).issues.createComment.callCount === 0);
    });

    test('specifying allowPullRequests: collaborators in the default branch disallows public', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/valid-yaml.json'),
      });
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: {version: 1, policy: {pullRequests: 'collaborators'}},
      });
      await simulateJobMessage({user: 'imbstack', eventType: 'pull_request.opened'});

      assert(github.inst(5828).repos.createStatus.callCount === 0);
      assert(github.inst(5828).issues.createComment.callCount === 1);
    });

    test('user name not checked for pushes, so status is created', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./data/yml/valid-yaml.json'),
      });
      await simulateJobMessage({user: 'imbstack', eventType: 'push'});

      assert(github.inst(5828).repos.createCommitComment.callCount === 0);
    });
  });

  suite('Statuses API: result status handler', function() {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function() {
      await helper.Builds.remove({taskGroupId: TASKGROUPID}, true);
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P32ow';

    async function assertStatusUpdate(state) {
      assert(github.inst(9988).repos.createStatus.calledOnce, 'createStatus was not called');
      let args = github.inst(9988).repos.createStatus.firstCall.args[0];
      assert.equal(args.owner, 'TaskclusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(args.state, state);
      assert(args.target_url.startsWith(URL_PREFIX));
      let taskGroupId = args.target_url.replace(URL_PREFIX, '').trim();
      assert.equal(taskGroupId, TASKGROUPID);
    }

    async function assertBuildState(state) {
      let build = await helper.Builds.load({taskGroupId: TASKGROUPID});
      assert.equal(build.state, state);
    }

    test('taskgroup success gets a success status', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-group-resolved',
        routingKey: 'primary.foo.tc-gh-devel.foo',
        taskId: null,
      });
      await assertStatusUpdate('success');
      await assertBuildState('success');
    });

    test('task failure gets a failure status', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-failed',
        routingKey: 'route.statuses',
        taskId: null,
      });
      await assertStatusUpdate('failure');
      await assertBuildState('failure');
    });

    test('task exception gets a failure status', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-exception',
        routingKey: 'route.statuses',
        taskId: null,
      });
      await assertStatusUpdate('failure');
      await assertBuildState('failure');
    });
  });

  suite('Checks API: result status handler', function() {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function() {
      await helper.Builds.remove({taskGroupId: TASKGROUPID}, true);
      await helper.CheckRuns.remove({taskGroupId: TASKGROUPID, taskId: TASKID});
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P32ow';
    const TASKID = 'banana';
    const CONCLUSIONS = { // maps status communicated by the queue service to github checkrun conclusions
      /*eslint-disable quote-props*/
      'completed': 'success',
      'failed': 'failure',
      'exception': 'failure',
      'deadline-exceeded': 'timed_out',
      'canceled': 'cancelled',
      'superseded': 'neutral', // means: is not relevant anymore
      'claim-expired': 'failure',
      'worker-shutdown': 'neutral', // means: will be retried
      'malformed-payload': 'action_required', // like, "correct your task definition"
      'resource-unavailable': 'failure',
      'internal-error': 'failure',
      'intermittent-task': 'neutral', // means: will be retried
    };

    async function assertStatusUpdate(state) {
      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let args = github.inst(9988).checks.update.firstCall.args[0];
      assert.equal(args.owner, 'TaskclusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.check_run_id, '22222');
      assert.equal(args.conclusion, CONCLUSIONS[state]);
    }

    function assertStatusCreate(state) {
      assert(github.inst(9988).checks.create.called, 'checks. create was not called');

      github.inst(9988).checks.create.firstCall.args.forEach(args => {
        if (args.state === state) {
          assert.equal(args.owner, 'TaskclusterRobot');
          assert.equal(args.repo, 'hooks-testing');
          assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
          debug('Created task group: ' + args.target_url);
          assert(args.target_url.startsWith(URL_PREFIX));
          let taskGroupId = args.target_url.substr(URL_PREFIX.length);
          assert.equal(taskGroupId, TASKGROUPID);
          assert.equal(/Taskcluster \((.*)\)/.exec(args.context)[1], 'push');
        }
      });
    }

    test('task success gets a success check result', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await addCheckRun({taskGroupId: TASKGROUPID, taskId: TASKID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });
      await assertStatusUpdate('completed');
    });

    test('task failure gets a failure check result', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await addCheckRun({taskGroupId: TASKGROUPID, taskId: TASKID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-failed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'failed',
        state: 'failed',
      });
      await assertStatusUpdate('failed');
    });

    test('task exception gets a failure check result', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await addCheckRun({taskGroupId: TASKGROUPID, taskId: TASKID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-exception',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'resource-unavailable',
        state: 'exception',
      });
      await assertStatusUpdate('failed');
    });

    test('successful task started by decision task gets a success comment', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });
      await assertStatusCreate('completed');
    });

    test('Undefined state/reasonResolved in the task exchange message -> neutral status, log error', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'banana',
        state: 'completed',
      });
      await assertStatusCreate('neutral');

      assert(monitorManager.messages.some(({Type, Severity}) => Type === 'monitor.error' && Severity === LEVELS.err));
      monitorManager.reset();
    });
  });

  suite('Statuses API: initial status handler', function() {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function() {
      await helper.Builds.remove({taskGroupId: TASKGROUPID}, true);
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P5555';

    function assertStatusCreation(state) {
      assert(github.inst(9988).repos.createStatus.called, 'createStatus was not called');

      github.inst(9988).repos.createStatus.firstCall.args.forEach(args => {
        if (args.state === state) {
          assert.equal(args.owner, 'TaskclusterRobot');
          assert.equal(args.repo, 'hooks-testing');
          assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
          debug('Created task group: ' + args.target_url);
          assert(args.target_url.startsWith(URL_PREFIX));
          let taskGroupId = args.target_url.substr(URL_PREFIX.length);
          assert.equal(taskGroupId, TASKGROUPID);
          assert.equal(/Taskcluster-Test \((.*)\)/.exec(args.context)[1], 'push');
        }
      });
    }

    test('create pending status when task is defined', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-github/v1/task-group-creation-requested',
        routingKey: 'route.statuses',
      });
      assertStatusCreation('pending');
    });
  });

  suite('Checks API: initial status handler', function() {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function() {
      await helper.Builds.remove({taskGroupId: TASKGROUPID}, true);
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P5555';
    const TASKID = 'banana';

    function assertStatusCreate(state) {
      assert(github.inst(9988).checks.create.called, 'createStatus was not called');

      github.inst(9988).checks.create.firstCall.args.forEach(args => {
        if (args.state === state) {
          assert.equal(args.owner, 'TaskclusterRobot');
          assert.equal(args.repo, 'hooks-testing');
          assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
          debug('Created task group: ' + args.target_url);
          assert(args.target_url.startsWith(URL_PREFIX));
          let taskGroupId = args.target_url.substr(URL_PREFIX.length);
          assert.equal(taskGroupId, TASKGROUPID);
          assert.equal(/Taskcluster \((.*)\)/.exec(args.context)[1], 'push');
        }
      });
    }

    test('create pending check result when task is defined', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-defined',
        routingKey: 'route.checks',
        taskId: TASKID,
      });
      assertStatusCreate('pending');
    });
  });
});
