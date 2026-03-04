import debugFactory from 'debug';
const debug = debugFactory('test');
import helper from './helper.js';
import assert from 'assert';
import sinon from 'sinon';
import libUrls from 'taskcluster-lib-urls';
import testing from '@taskcluster/lib-testing';
import taskcluster from '@taskcluster/client';
import { LEVELS } from '@taskcluster/lib-monitor';
import { CHECKLOGS_TEXT, CHECKRUN_TEXT, CHECK_TASK_GROUP_TEXT } from '../src/constants.js';
import utils from '../src/utils.js';
import fs from 'fs';
import path from 'path';

const dataDir = new URL('./data', import.meta.url).pathname;
const loadJson = filename => JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf8'));

/**
 * This tests the event handlers, faking out all of the services they
 * interact with.
 */
helper.secrets.mockSuite(testing.suiteName(), [], function (mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeGithub(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.resetTables(mock, skipping);

  const validYamlJson = loadJson('yml/valid-yaml.json');
  const validYamlV1Json = loadJson('yml/valid-yaml-v1.json');
  const validYamlCommentsJson = loadJson('yml/valid-yaml-comments.json');
  const invalidTaskJson = loadJson('yml/invalid-task.json');
  const invalidYamlJson = loadJson('yml/invalid-yaml.json');

  const webhookCommentEditedJson = loadJson('webhooks/webhook.issue_comment.edited.json');

  const URL_PREFIX = 'https://tc-tests.example.com/tasks/groups/';
  const CUSTOM_CHECKRUN_TASKID = 'apple';
  const CUSTOM_LIVELOG_NAME_TASKID = 'banana';
  const CUSTOM_CHECKRUN_TEXT = 'Hi there! This is your custom text';
  const LIVE_LOG_TEXT = 'Hi there! This is your live log';
  const CUSTOM_CHECKRUN_ANNOTATIONS = JSON.stringify([
    { path: 'assets/css/main.css', start_line: 1, end_line: 2, annotation_level: 'notice', message: 'Hi there!' },
  ]);

  const COMMIT_SHA = '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf';
  const INST_ID = 5828;

  let github = null;
  let handlers = null;

  function buildArtifactLinks(limit, taskId) {

    const artifactLinks = [];

    for (let i = 0;i < limit;i++) {
      artifactLinks.push(`\\- [artifact-${i}](${libUrls.testRootUrl()}/tasks/${taskId}/runs/0/artifact-${i})`);
    }

    return artifactLinks.join('\n');
  }
  async function addBuild({ state, taskGroupId, pullNumber, eventType = 'push' }) {
    debug(`adding Build row for ${taskGroupId} in state ${state}`);
    await helper.db.fns.create_github_build_pr(
      'TaskclusterRobot',
      'hooks-testing',
      COMMIT_SHA,
      taskGroupId,
      state,
      new Date(),
      new Date(),
      9988,
      eventType,
      'aaa-bbb',
      pullNumber,
    );
  }

  async function addCheckRun({ taskGroupId, taskId, checkSuiteId = '11111', checkRunId = '22222' }) {
    debug(`adding CheckRun row for task ${taskId} of group ${taskGroupId}`);
    await helper.db.fns.create_github_check(
      taskGroupId,
      taskId,
      checkSuiteId,
      checkRunId,
    );
  }

  async function simulateExchangeMessage({
    taskGroupId, exchange, routingKey,
    taskId, state, reasonResolved,
    runId = 0, started,
    resolved, retriesLeft,
  }) {
    // set up to resolve when the handler has finished (even if it finishes with error)
    const handlerComplete = new Promise((resolve, reject) => {
      handlers.handlerComplete = resolve;
      handlers.handlerRejected = reject;
    });

    debug(`publishing ${JSON.stringify({ taskGroupId, exchange })}`);
    const message = {
      exchange,
      routingKey,
      routes: [],
      payload: {
        status: {
          taskGroupId,
          taskId,
          state,
          retriesLeft,
          runs: Array.from({ length: runId + 1 }).map(() => ({
            reasonResolved,
            state: 'completed',
            started: started,
            resolved: resolved,
          })),
        },
        taskGroupId,
        runId,
      },
    };

    await helper.fakePulseMessage(message);
    await handlerComplete;
  }

  setup(async function () {
    helper.load.save();

    helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
    github = await helper.load('github');
    handlers = await helper.load('handlers');

    await handlers.setup();

    // stub out `createTasks` so that we don't actually create tasks
    handlers.realCreateTasks = handlers.createTasks;
    handlers.createTasks = sinon.stub();
    handlers.queueClient = {
      task: taskId => {
        switch (taskId) {
          case CUSTOM_CHECKRUN_TASKID:
            return Promise.resolve({
              metadata: {
                name: 'Task with custom check run',
                description: 'Task Description',
              },
              extra: {
                github: {
                  customCheckRun: {
                    textArtifactName: 'public/text.md',
                  },
                },
              },
            });

          case CUSTOM_LIVELOG_NAME_TASKID:
            return Promise.resolve({
              metadata: {
                name: 'Task with custom live log path',
                description: 'Task Description',
              },
              payload: {
                logs: {
                  live: 'apple/banana.log',
                },
              },
            });

          default:
            return Promise.resolve({
              metadata: {
                name: 'Task Name',
                description: 'Task Description',
              },
            });
        }
      },
      listTaskGroup: async () => ({ tasks: [] }),
      listArtifacts: async (taskId, runId, options) => {

        const artifacts = [];

        for (let i = 0;i < options.limit;i++) {
          artifacts.push({
            name: `artifact-${i}`,
          });
        }
        return Promise.resolve({ artifacts });
      },
      use: () => ({
        getArtifact: async () => CUSTOM_CHECKRUN_TEXT,
        buildSignedUrl: async () => 'http://example.com',
      }),
    };

    handlers.realCancelPreviousTaskGroups = handlers.cancelPreviousTaskGroups;
    handlers.cancelPreviousTaskGroups = sinon.stub();

    // set up the allowPullRequests key
    github.inst(INST_ID).setRepoInfo({
      owner: 'TaskclusterRobot',
      repo: 'hooks-testing',
      info: { default_branch: 'development' },
    });
  });

  teardown(async function () {
    await handlers.terminate();
    helper.load.restore();
  });

  suite('createTasks', function () {
    let createdTasks;

    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    setup(function () {
      createdTasks = [];

      handlers.queueClient = new taskcluster.Queue({
        rootUrl: 'https://tc.example.com',
        fake: {
          createTask: async (taskId, taskDef) => {
            if (taskId === 'fail') {
              const { message, ...errorProps } = taskDef;
              throw Object.assign(new Error(message), errorProps);
            }
            createdTasks.push(taskDef);
          },
        },
      });
    });

    test('does not call queue.createTask if given no tasks', async function () {
      await handlers.realCreateTasks({ scopes: [], tasks: [] });
      assert.equal(createdTasks.length, 0);
    });

    test('calls queue.createTask in order', async function () {
      await handlers.realCreateTasks({
        scopes: [], tasks: [
          { taskId: 'aa', task: { payload: 'a' } },
          { taskId: 'bb', task: { payload: 'b' } },
          { taskId: 'cc', task: { payload: 'c' } },
        ],
      });
      assert.deepEqual(createdTasks.map(({ payload }) => payload), ['a', 'b', 'c']);
    });

    test('propagates unknown errors', async function () {
      await assert.rejects(
        handlers.realCreateTasks({
          scopes: [], tasks: [
            { taskId: 'fail', task: { message: 'uhoh' } },
          ],
        }),
        err => err.message === 'uhoh',
      );
    });

    test('handles InsufficientScopes errors', async function () {
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
            ["assume:repo:github.com/a/b:branch:master","queue:route:statuses"]
            \`\`\`

            The expansion of these scopes is not sufficient to create the task, leading to the following:

            Client ID project/taskcluster/tc-github/production-2 does not have sufficient scopes blah blah`
            .replace(/^ {12}/mg, ''));
          return true;
        },
      );
    });
  });

  suite('cancelPreviousTaskGroups', function () {
    let sealedTaskGroups;
    let cancelledTaskGroups;

    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    setup(function () {
      sealedTaskGroups = [];
      cancelledTaskGroups = [];

      handlers.queueClient = new taskcluster.Queue({
        rootUrl: 'https://tc.example.com',
        fake: {
          sealTaskGroup: async (taskGroupId) => {
            sealedTaskGroups.push(taskGroupId);
          },
          cancelTaskGroup: async (taskGroupId) => {
            cancelledTaskGroups.push(taskGroupId);
          },
        },
      });
    });

    test('does not call queue.sealTaskGroup/cancelTaskGroup if no previous builds', async function () {
      await handlers.realCancelPreviousTaskGroups({
        instGithub: sinon.stub(),
        debug: sinon.stub(),
        newBuild: { sha: 'none', organization: 'none', repository: 'none' },
      });
      assert.equal(sealedTaskGroups.length, 0);
      assert.equal(cancelledTaskGroups.length, 0);
    });

    test('errors in queue.sealTask/cancelTaskGroup group are logged', async function () {
      handlers.queueClient = new taskcluster.Queue({
        rootUrl: 'https://tc.example.com',
        fake: {
          sealTaskGroup: async (taskGroupId) => {
            throw new Error('sealTaskGroup error: missing scopes');
          },
          cancelTaskGroup: async (taskGroupId) => {
            throw new Error('cancelTaskGroup error: missing scopes');
          },
        },
      });

      await addBuild({ state: 'pending', taskGroupId: 'aa', pullNumber: 1, eventType: 'pull_request.opened' });
      await addBuild({ state: 'pending', taskGroupId: 'bb', pullNumber: 1, eventType: 'pull_request.synchronize' });

      const instGithub = github.inst(INST_ID);

      await handlers.realCancelPreviousTaskGroups({
        instGithub,
        debug: sinon.stub(),
        newBuild: {
          sha: COMMIT_SHA, organization: 'TaskclusterRobot', repository: 'hooks-testing',
          pull_number: 1, event_type: 'pull_request.synchronize',
        },
      });
      assert(instGithub.issues.createComment.calledOnce);
      let args = instGithub.issues.createComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].issue_number, 1);

      const monitor = await helper.load('monitor');
      assert(monitor.manager.messages.some(
        ({ Type, Severity, Fields }) => Type === 'monitor.error' && Severity === LEVELS.err && Fields.message.includes('sealTaskGroup error: missing scopes'),
      ));
      monitor.manager.reset();
    });

    test('non-existent task groups queue.sealTask/cancelTaskGroup group are ignored', async function () {
      const err = new Error('ResourceNotFound');
      err.code = 'ResourceNotFound';
      err.statusCode = 404;
      handlers.queueClient = new taskcluster.Queue({
        rootUrl: 'https://tc.example.com',
        fake: {
          sealTaskGroup: async (taskGroupId) => {
            err.method = 'sealTaskGroup';
            throw err;
          },
          cancelTaskGroup: async (taskGroupId) => {
            err.method = 'cancelTaskGroup';
            throw err;
          },
        },
      });

      await addBuild({ state: 'pending', taskGroupId: 'aa', pullNumber: 1, eventType: 'pull_request.opened' });
      await addBuild({ state: 'pending', taskGroupId: 'bb', pullNumber: 1, eventType: 'pull_request.synchronize' });

      const instGithub = github.inst(INST_ID);

      await handlers.realCancelPreviousTaskGroups({
        instGithub,
        debug: sinon.stub(),
        newBuild: {
          sha: COMMIT_SHA, organization: 'TaskclusterRobot', repository: 'hooks-testing',
          pull_number: 1, event_type: 'pull_request.synchronize',
        },
      });
      assert(instGithub.issues.createComment.notCalled);

      const monitor = await helper.load('monitor');
      assert(monitor.manager.messages.some(
        ({ Type, Severity, Fields }) => Type === 'monitor.error' && Severity === LEVELS.err && Fields.message.includes('Task group not found in queue'),
      ));
      monitor.manager.reset();

      // builds should still be cancelled in db
      const [[buildA], [buildB]] = await Promise.all([
        helper.db.fns.get_github_build_pr('aa'),
        helper.db.fns.get_github_build_pr('bb'),
      ]);
      assert.equal(buildA.state, 'cancelled');
      assert.equal(buildB.state, 'cancelled');
    });

    test('calls queue.sealTaskGroup/cancelTaskGroup for pulNumber excluding new task group id', async function () {
      await addBuild({ state: 'pending', taskGroupId: 'aa', pullNumber: 1, eventType: 'pull_request.opened' });
      await addBuild({ state: 'pending', taskGroupId: 'bb', pullNumber: 1, eventType: 'pull_request.synchronize' });
      await addBuild({ state: 'pending', taskGroupId: 'cc', pullNumber: 1, eventType: 'pull_request.synchronize' });
      await addBuild({ state: 'pending', taskGroupId: 'dd', pullNumber: 1, eventType: 'pull_request.closed' });
      await handlers.realCancelPreviousTaskGroups({
        instGithub: sinon.stub(),
        debug: sinon.stub(),
        newBuild: {
          sha: 'none', task_group_id: 'bb',
          organization: 'TaskclusterRobot',
          repository: 'hooks-testing', pull_number: 1,
          event_type: 'pull_request.synchronize',
        },
      });

      assert.deepEqual(sealedTaskGroups, ['aa', 'cc']);
      assert.deepEqual(cancelledTaskGroups, ['aa', 'cc']);
      const [buildA] = await helper.db.fns.get_github_build_pr('aa');
      assert.equal(buildA.state, 'cancelled');
      const [buildC] = await helper.db.fns.get_github_build_pr('cc');
      assert.equal(buildC.state, 'cancelled');
    });

    test('calls queue.sealTaskGroup/cancelTaskGroup for SHA excluding new task group id', async function () {
      await addBuild({ state: 'pending', taskGroupId: 'aa' });
      await addBuild({ state: 'pending', taskGroupId: 'bb' });
      await addBuild({ state: 'pending', taskGroupId: 'cc' });
      await handlers.realCancelPreviousTaskGroups({
        instGithub: sinon.stub(),
        debug: sinon.stub(),
        newBuild: {
          sha: COMMIT_SHA, task_group_id: 'bb',
          organization: 'TaskclusterRobot', repository: 'hooks-testing', event_type: 'push',
        },
      });

      // tasks should not cancelled for push events
      assert.deepEqual(sealedTaskGroups, []);
      assert.deepEqual(cancelledTaskGroups, []);
    });

    test('respects same event types for pull_request', async function () {
      await addBuild({ state: 'pending', taskGroupId: 'aa', pullNumber: 3, eventType: 'pull_request.opened' });
      await addBuild({ state: 'pending', taskGroupId: 'bb', pullNumber: 3, eventType: 'pull_request.synchronize' });
      await addBuild({ state: 'pending', taskGroupId: 'cc', pullNumber: 3, eventType: 'pull_request.closed' });
      await addBuild({ state: 'pending', taskGroupId: 'dd', pullNumber: 3, eventType: 'pull_request.assigned' });
      await addBuild({ state: 'pending', taskGroupId: 'ee', pullNumber: null, eventType: 'tag' });
      await addBuild({ state: 'pending', taskGroupId: 'ff', pullNumber: null, eventType: 'push' });

      await handlers.realCancelPreviousTaskGroups({
        instGithub: sinon.stub(),
        debug: sinon.stub(),
        newBuild: {
          sha: COMMIT_SHA,
          task_group_id: 'bb',
          organization: 'TaskclusterRobot',
          repository: 'hooks-testing',
          event_type: 'pull_request.synchronize',
          pull_number: 3,
        },
      });
      assert.deepEqual(sealedTaskGroups, ['aa']);
      assert.deepEqual(cancelledTaskGroups, ['aa']);
    });

    test('cancels nothing on release event', async function () {
      await addBuild({ state: 'pending', taskGroupId: 'aa', pullNumber: null, eventType: 'release' });
      await addBuild({ state: 'pending', taskGroupId: 'bb', pullNumber: 1012, eventType: 'pull_request.opened' });
      await addBuild({ state: 'pending', taskGroupId: 'ee', pullNumber: null, eventType: 'tag' });
      await addBuild({ state: 'pending', taskGroupId: 'ff', pullNumber: null, eventType: 'push' });

      await handlers.realCancelPreviousTaskGroups({
        instGithub: sinon.stub(),
        debug: sinon.stub(),
        newBuild: {
          sha: COMMIT_SHA,
          task_group_id: 'gg',
          organization: 'TaskclusterRobot',
          repository: 'hooks-testing',
          event_type: 'release',
        },
      });

      assert.deepEqual(sealedTaskGroups, []);
      assert.deepEqual(cancelledTaskGroups, []);
    });
    test('cancels nothing on unknown event', async function () {
      await addBuild({ state: 'pending', taskGroupId: 'aa', pullNumber: null, eventType: 'release' });
      await addBuild({ state: 'pending', taskGroupId: 'bb', pullNumber: 1012, eventType: 'pull_request.opened' });
      await addBuild({ state: 'pending', taskGroupId: 'ee', pullNumber: null, eventType: 'tag' });
      await addBuild({ state: 'pending', taskGroupId: 'ff', pullNumber: null, eventType: 'push' });

      await handlers.realCancelPreviousTaskGroups({
        instGithub: sinon.stub(),
        debug: sinon.stub(),
        newBuild: {
          sha: COMMIT_SHA,
          task_group_id: 'gg',
          organization: 'TaskclusterRobot',
          repository: 'hooks-testing',
          event_type: 'bogus',
        },
      });

      assert.deepEqual(sealedTaskGroups, []);
      assert.deepEqual(cancelledTaskGroups, []);
    });
  });

  suite('jobHandler', function () {
    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    // set any of the three important users for a PR:
    // opener -> pull_request.user.login (defaults to user)
    // headUser -> pull_request.head.user.login (defaults to user)
    // baseUser -> pull_request.base.user.login (defaults to hooks-testing)
    async function simulateJobMessage({ user, opener, headUser, baseUser, head, base,
      branch = 'tc-gh-tests', eventType = 'push', pullNumber = 36 }) {
      // set up to resolve when the handler has finished (even if it finishes with error)
      const handlerComplete = new Promise((resolve, reject) => {
        handlers.handlerComplete = resolve;
        handlers.handlerRejected = reject;
      });
      const [eventBase, eventAction] = eventType.split('.');

      let body = {};
      let details = {
        'event.type': eventType,
        'event.base.repo.branch': branch,
        'event.head.repo.branch': branch,
        'event.head.user.login': user,
        'event.head.repo.url': 'https://github.com/TaskclusterRobot/hooks-testing.git',
        'event.head.sha': head || COMMIT_SHA,
        'event.head.ref': `refs/heads/${branch}`,
        'event.base.sha': base || '2bad4edf90e7d4fb4643456a4df333da348bbed4',
        'event.head.user.id': 190790,
      };
      if (eventBase === 'pull_request') {
        body['pull_request'] = {
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
        };
      } else if (eventBase === 'release') {
        // remove a few details fields from the above that aren't present in releases,
        // and add one that is present.  Note that this isn't incomplete, and leaves some
        // fields in place that shouldn't be here and omits fields that should be here.
        // This should be solved in a more reliable fashion.
        delete details['event.head.sha'];
        delete details['event.head.ref'];
        delete body['pull_request'];
        body['release'] = {
          target_commitish: 'refs/tags/v1.2.3',
        };
        details['event.version'] = 'v1.2.3';
      } else if (eventBase === 'tag') {
        details['event.head.tag'] = 'v1.0.2';
        delete details['event.head.repo.branch'];
        delete details['event.base.repo.branch'];
      } else if (eventBase === 'push') {
        body['ref'] = branch;
      }

      debug(`publishing ${JSON.stringify({ user, head, base, eventType })}`);
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
          installationId: INST_ID,
          version: 1,
          body,
          tasks_for: `github-${exchange}`,
        },
      };
      if (eventBase === 'pull_request') {
        message.payload.details['event.pullNumber'] = pullNumber;
      }

      await helper.fakePulseMessage(message);
      await handlerComplete;
    }

    test('tasks generated as non-list', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: { version: 1, tasks: {} },
      });
      await simulateJobMessage({ user: 'TaskclusterRobot' });

      assert(github.inst(INST_ID).repos.createCommitComment.calledOnce);
      let args = github.inst(INST_ID).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, COMMIT_SHA);
      assert(args[0][0].body.indexOf('tasks field  of .taskcluster.yml must be array of tasks or empty array') !== -1);
    });

    test('tasks generated as undefined is OK', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: { version: 1, tasks: undefined },
      });
      await simulateJobMessage({ user: 'TaskclusterRobot' });

      assert(github.inst(INST_ID).repos.createCommitComment.notCalled);
    });

    test('valid push (owner is collaborator) creates a taskGroup', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      await simulateJobMessage({ user: 'TaskclusterRobot' });

      assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, COMMIT_SHA);
      assert.equal(build.state, 'pending');
    });

    test('valid pull_request (user is collaborator) creates a taskGroup', async function () {
      github.inst(INST_ID).setRepoCollaborator({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        username: 'goodBuddy',
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA, // HEAD
        content: validYamlJson,
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: validYamlJson,
      });

      await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.opened' });

      assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, COMMIT_SHA);
      assert.equal(build.state, 'pending');
    });

    test('valid pull_request (user is not a collaborator) does not create tasks', async function() {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA, // HEAD
        content: validYamlJson,
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: validYamlJson,
      });

      await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.opened' });

      assert(handlers.createTasks.notCalled);
    });

    test('valid pull_request (user is not a collaborator, policy is public) creates a taskGroup', async function() {
      let tcyaml = { ...validYamlV1Json };
      tcyaml['policy'] = { 'pullRequests': 'public' };

      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA, // HEAD
        content: tcyaml,
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: tcyaml,
      });

      await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.opened' });

      assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
      let args = handlers.createTasks.firstCall.args[0];
      assert.ok(args.scopes.includes('assume:repo:github.com/TaskclusterRobot/hooks-testing:pull-request'));

      let taskGroupId = args.tasks[0].task.taskGroupId;
      let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, COMMIT_SHA);
      assert.equal(build.state, 'pending');
    });

    test('valid pull_request (user is not a collaborator, policy is public_restricted) creates a taskGroup', async function() {
      let tcyaml = { ...validYamlV1Json };
      tcyaml['policy'] = { 'pullRequests': 'public_restricted' };

      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA, // HEAD
        content: tcyaml,
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: tcyaml,
      });

      await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.opened' });

      assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
      let args = handlers.createTasks.firstCall.args[0];
      assert.ok(args.scopes.includes('assume:repo:github.com/TaskclusterRobot/hooks-testing:pull-request-untrusted'));

      let taskGroupId = args.tasks[0].task.taskGroupId;
      let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, COMMIT_SHA);
      assert.equal(build.state, 'pending');
    });

    test('valid push (but not collaborator) creates a taskGroup', async function() {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      await simulateJobMessage({ user: 'TaskclusterCollaborator', eventType: 'push' });

      assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, COMMIT_SHA);
      assert.equal(build.state, 'pending');
    });

    test('valid tag push (but not collaborator) creates a taskGroup', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      await simulateJobMessage({
        user: 'TaskclusterRobotCollaborator',
        base: '0000000000000000000000000000000000000000',
        eventType: 'tag',
      },
      );

      assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
      let args = handlers.createTasks.firstCall.args[0];
      let taskGroupId = args.tasks[0].task.taskGroupId;
      let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
      assert.equal(build.organization, 'TaskclusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, COMMIT_SHA);
      assert.equal(build.state, 'pending');
    });

    test('invalid task list results in a comment', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: invalidTaskJson,
      });
      await simulateJobMessage({ user: 'TaskclusterRobot' });

      assert(github.inst(INST_ID).repos.createCommitStatus.callCount === 0, 'Status was unexpectedly updated!');
      assert(github.inst(INST_ID).repos.createCommitComment.calledOnce);
      let args = github.inst(INST_ID).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, COMMIT_SHA);
      assert(args[0][0].body.indexOf('data/tasks must be array') !== -1);
    });

    test('invalid YAML results in a comment', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: invalidYamlJson,
      });
      await simulateJobMessage({ user: 'TaskclusterRobot' });

      assert(github.inst(INST_ID).repos.createCommitStatus.callCount === 0, 'Status was unexpectedly updated!');
      assert(github.inst(INST_ID).repos.createCommitComment.calledOnce);
      let args = github.inst(INST_ID).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, COMMIT_SHA);
      assert(args[0][0].body.indexOf('data must NOT have additional properties') !== -1);
    });

    test('error creating task is reported correctly', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      handlers.createTasks.rejects({ body: { error: 'oh noes' } });
      await simulateJobMessage({ user: 'goodBuddy' });

      assert(github.inst(INST_ID).repos.createCommitComment.calledOnce);
      let args = github.inst(INST_ID).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, COMMIT_SHA);
      assert(args[0][0].body.indexOf('oh noes') !== -1);
    });

    suite('Issue comment', function () {
      async function simulateIssueCommentMessage({ user, body = null }) {
        if (!body) {
          body = webhookCommentEditedJson.body;
        }
        // patch body to have some user
        body.comment.user.login = user;

        const handlerComplete = new Promise((resolve, reject) => {
          handlers.handlerComplete = resolve;
          handlers.handlerRejected = reject;
        });
        const message = {
          exchange: `exchange/taskcluster-github/v1/pull-request`,
          routingKey: `primary.taskcluster.tc-dev-integration-test.updated`,
          routes: [],
          payload: {
            organization: 'taskcluster',
            details: {
              'event.type': 'issue_comment.edited',
              'event.head.user.login': user,
              'taskcluster_comment': 'test',
            },
            repository: 'tc-dev-integration-test',
            eventId: '89f8d660-272e-11ef-94cc-d31d5b8b32ee',
            installationId: INST_ID,
            version: 1,
            body,
            tasks_for: `github-issue-comment`,
          },
        };
        await helper.fakePulseMessage(message);
        await handlerComplete;
      }

      let instGithub;

      setup(function () {
        instGithub = github.inst(INST_ID);
        instGithub.setRepoCollaborator({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test',
          username: 'lotas',
        });
        instGithub.setTaskclusterYml({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test',
          ref: COMMIT_SHA,
          content: validYamlCommentsJson,
        });
        instGithub.setTaskclusterYml({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test',
          ref: 'development',
          content: validYamlCommentsJson,
        });
        instGithub.setTaskclusterYml({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test-nocomments',
          ref: 'development',
          content: validYamlV1Json,
        });
        instGithub.setPullInfo({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test',
          pull_number: 15,
          info: {
            number: 15,
            head: { sha: COMMIT_SHA },
          },
        });
        instGithub.setRepoInfo({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test',
          info: { default_branch: 'development' },
        });
      });

      test('valid issue_comment (user is collaborator) creates a taskGroup', async function () {
        await simulateIssueCommentMessage({ user: 'lotas' });

        assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
        let args = handlers.createTasks.firstCall.args[0];
        let taskGroupId = args.tasks[0].task.taskGroupId;
        let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
        assert.equal(build.organization, 'taskcluster');
        assert.equal(build.repository, 'tc-dev-integration-test');
        assert.equal(build.sha, COMMIT_SHA);
        assert.equal(build.state, 'pending');
      });

      test('valid issue_comment (user is collaborator) no tasks created', async function () {
        instGithub.setTaskclusterYml({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test',
          ref: COMMIT_SHA,
          content: {
            ...validYamlCommentsJson,
            tasks: [],
          },
        });

        await simulateIssueCommentMessage({ user: 'lotas' });

        assert(handlers.createTasks.notCalled);
        assert(instGithub.issues.createComment.calledOnce);
      });

      test('valid issue_comment (user is not a collaborator) skips task creation', async function () {
        await simulateIssueCommentMessage({ user: 'notCollaborator' });

        assert(handlers.createTasks.notCalled);
        assert(instGithub.issues.createComment.calledOnce);
        let args = instGithub.issues.createComment.args;
        assert.equal(args[0][0].owner, 'taskcluster');
        assert.equal(args[0][0].repo, 'tc-dev-integration-test');
        assert.equal(args[0][0].issue_number, 15);
        assert(args[0][0].body.indexOf('is not a collaborator') !== -1);
      });

      test('.taskcluster.yml does not allow comments - no tasks created ', async function () {
        instGithub.setTaskclusterYml({
          owner: 'taskcluster',
          repo: 'tc-dev-integration-test',
          ref: 'development',
          content: validYamlV1Json,
        });
        await simulateIssueCommentMessage({ user: 'notCollaborator' });

        assert(handlers.createTasks.notCalled);
        assert(instGithub.issues.createComment.calledOnce);
        let args = instGithub.issues.createComment.args;
        assert.equal(args[0][0].owner, 'taskcluster');
        assert.equal(args[0][0].repo, 'tc-dev-integration-test');
        assert.equal(args[0][0].issue_number, 15);
        assert(args[0][0].body.indexOf('does not allow starting tasks from comments') !== -1);
        assert(instGithub.reactions.createForIssueComment.calledOnce);
      });
    });

    suite('Cancel running task groups', function () {
      test('should not cancel task groups on the default branch', async function () {
        const tcYaml = validYamlV1Json;
        github.inst(INST_ID).setRepoCollaborator({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          username: 'goodBuddy',
        });
        github.inst(INST_ID).setTaskclusterYml({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          ref: 'development',
          content: tcYaml,
        });
        await simulateJobMessage({ user: 'goodBuddy', branch: 'development', head: 'development', base: 'development' });

        assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
        let args = handlers.createTasks.firstCall.args[0];
        let taskGroupId = args.tasks[0].task.taskGroupId;
        let [build] = await helper.db.fns.get_github_build_pr(taskGroupId);
        assert.equal(build.organization, 'TaskclusterRobot');
        assert.equal(build.repository, 'hooks-testing');
        assert.equal(build.sha, 'development');
        assert.equal(build.state, 'pending');

        assert(handlers.cancelPreviousTaskGroups.notCalled);
      });
      test('should respect .taskcluster.yml autoCancelPreviousChecks config', async function () {
        const tcYaml = validYamlV1Json;
        tcYaml['autoCancelPreviousChecks'] = false;
        github.inst(INST_ID).setTaskclusterYml({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          ref: COMMIT_SHA,
          content: tcYaml,
        });
        await simulateJobMessage({ user: 'TaskclusterRobot' });
        assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
        assert(handlers.cancelPreviousTaskGroups.notCalled);

        tcYaml['autoCancelPreviousChecks'] = true;
        github.inst(INST_ID).setTaskclusterYml({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          ref: COMMIT_SHA,
          content: tcYaml,
        });
        await simulateJobMessage({ user: 'TaskclusterRobot' });
        assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
        let args = handlers.createTasks.secondCall.args[0];
        let taskGroupId = args.tasks[0].task.taskGroupId;

        assert(handlers.cancelPreviousTaskGroups.calledOnce);
        const cancelCallArgs = handlers.cancelPreviousTaskGroups.firstCall.args[0];
        assert.equal(cancelCallArgs.newBuild.organization, 'TaskclusterRobot');
        assert.equal(cancelCallArgs.newBuild.repository, 'hooks-testing');
        assert.equal(cancelCallArgs.newBuild.task_group_id, taskGroupId);
        assert.equal(cancelCallArgs.newBuild.sha, COMMIT_SHA);
        assert.equal(cancelCallArgs.newBuild.pull_number, null);
      });
      test('should cancel by default', async function () {
        const tcYaml = validYamlV1Json;
        github.inst(INST_ID).setRepoCollaborator({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          username: 'goodBuddy',
        });
        github.inst(INST_ID).setTaskclusterYml({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          ref: COMMIT_SHA,
          content: tcYaml,
        });
        await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.opened', pullNumber: 1001 });
        assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
        assert(handlers.cancelPreviousTaskGroups.calledOnce);
      });
      test('should cancel task groups for same pull request number', async function () {
        const tcYaml = validYamlV1Json;
        tcYaml['autoCancelPreviousChecks'] = true;
        github.inst(INST_ID).setRepoCollaborator({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          username: 'goodBuddy',
        });
        github.inst(INST_ID).setTaskclusterYml({
          owner: 'TaskclusterRobot',
          repo: 'hooks-testing',
          ref: COMMIT_SHA,
          content: tcYaml,
        });
        await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.opened', pullNumber: 1001 });

        assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
        let args = handlers.createTasks.firstCall.args[0];
        let taskGroupId = args.tasks[0].task.taskGroupId;

        assert(handlers.cancelPreviousTaskGroups.calledOnce);

        const cancelCallArgs = handlers.cancelPreviousTaskGroups.firstCall.args[0];
        assert.equal(cancelCallArgs.newBuild.organization, 'TaskclusterRobot');
        assert.equal(cancelCallArgs.newBuild.repository, 'hooks-testing');
        assert.equal(cancelCallArgs.newBuild.task_group_id, taskGroupId);
        assert.equal(cancelCallArgs.newBuild.pull_number, 1001);

        await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.synchronize', pullNumber: 1001 });
        assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
        let args2 = handlers.createTasks.secondCall.args[0];
        let taskGroupId2 = args2.tasks[0].task.taskGroupId;

        assert(handlers.cancelPreviousTaskGroups.calledTwice);
        const cancelCallArgs2 = handlers.cancelPreviousTaskGroups.secondCall.args[0];
        assert.equal(cancelCallArgs2.newBuild.organization, 'TaskclusterRobot');
        assert.equal(cancelCallArgs2.newBuild.repository, 'hooks-testing');
        assert.equal(cancelCallArgs2.newBuild.task_group_id, taskGroupId2);
        assert.equal(cancelCallArgs2.newBuild.pull_number, 1001);
      });
    });

    suite('PR permissions (collaborators)', function () {
      const testPermissions = (name, { opener, headUser, succeed }) => {
        test(name, async function () {
          github.inst(INST_ID).setRepoCollaborator({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            username: 'friendlyFace',
          });
          github.inst(INST_ID).setRepoCollaborator({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            username: 'goodBuddy',
          });
          github.inst(INST_ID).setTaskclusterYml({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            ref: COMMIT_SHA,
            content: validYamlJson,
          });
          github.inst(INST_ID).setTaskclusterYml({
            owner: 'TaskclusterRobot',
            repo: 'hooks-testing',
            ref: 'development',
            content: { version: 0, allowPullRequests: 'collaborators' },
          });

          await simulateJobMessage({ opener, headUser, baseUser: 'hooks-testing', eventType: 'pull_request.opened' });

          if (succeed) {
            assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
          } else {
            assert(github.inst(INST_ID).issues.createComment.calledOnce);
            let args = github.inst(INST_ID).issues.createComment.args;
            assert.equal(args[0][0].owner, 'TaskclusterRobot');
            assert.equal(args[0][0].repo, 'hooks-testing');
            assert.equal(args[0][0].issue_number, '36');
            assert(args[0][0].body.indexOf('No Taskcluster jobs started for this pull request') !== -1);
          }
        });
      };

      testPermissions('all from bad guy', { opener: 'badguy', headUser: 'badguy', succeed: false });
      testPermissions('collaborator opens PR for non-collaborator', { opener: 'goodBuddy', headUser: 'badguy', succeed: false });
      testPermissions('non-collaborator opens PR for collaborator', { opener: 'badguy', headUser: 'goodBuddy', succeed: false });
      testPermissions('collaborator opens PR for self', { opener: 'goodBuddy', headUser: 'goodBuddy', succeed: true });
      testPermissions('collaborator opens PR for friendly face', { opener: 'goodBuddy', headUser: 'friendlyFace', succeed: true });
      testPermissions('collaborator opens PR for upstream repo', { opener: 'goodBuddy', headUser: 'hooks-testing', succeed: true });
      testPermissions('collaborator opens PR for another repo', { opener: 'goodBuddy', headUser: 'some-other-repo', succeed: false });
    });

    test('specifying allowPullRequests: public in the default branch allows all', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: { version: 0, allowPullRequests: 'public' },
      });
      await simulateJobMessage({ user: 'imbstack', eventType: 'pull_request.opened' });

      assert(github.inst(INST_ID).issues.createComment.callCount === 0);
    });

    test('specifying allowPullRequests: collaborators in the default branch disallows public', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: { version: 1, policy: { pullRequests: 'collaborators' } },
      });
      await simulateJobMessage({ user: 'imbstack', eventType: 'pull_request.opened' });

      assert(github.inst(INST_ID).repos.createCommitStatus.callCount === 0);
      assert(github.inst(INST_ID).issues.createComment.callCount === 1);
    });

    test('user name not checked for pushes, so status is created', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      await simulateJobMessage({ user: 'imbstack', eventType: 'push' });

      assert(github.inst(INST_ID).repos.createCommitComment.callCount === 0);
    });

    test('sha for release fetched correctly', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        // note that this ends up compiling to zero tasks for a release
        content: validYamlJson,
      });
      github.inst(INST_ID).setCommit({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'refs/tags/v1.2.3',
        sha: COMMIT_SHA,
      });
      await simulateJobMessage({ user: 'imbstack', eventType: 'release' });

      assert(github.inst(INST_ID).repos.createCommitComment.callCount === 0);
    });

    test('no .taskcluster.yml, using collaborators policy', async function () {
      github.inst(INST_ID).setRepoCollaborator({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        username: 'goodBuddy',
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: COMMIT_SHA,
        content: validYamlJson,
      });
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: null,
      });
      await simulateJobMessage({ user: 'goodBuddy', eventType: 'pull_request.opened' });

      assert(handlers.createTasks.calledWith({ scopes: sinon.match.array, tasks: sinon.match.array }));
    });

    test('using collaborators_quiet policy should not create comment', async function () {
      github.inst(INST_ID).setTaskclusterYml({
        owner: 'TaskclusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: { version: 1, policy: { pullRequests: 'collaborators_quiet' } },
      });
      await simulateJobMessage({ user: 'not-a-collaborator', eventType: 'pull_request.opened' });

      assert(github.inst(INST_ID).repos.createCommitStatus.callCount === 0);
      assert(github.inst(INST_ID).issues.createComment.callCount === 0);
    });
  });

  suite('Statuses API: result status handler', function () {
    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P32o1';

    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function () {
      await helper.db.fns.delete_github_build(TASKGROUPID);
    });

    async function assertStatusUpdate(state) {
      assert(github.inst(9988).repos.createCommitStatus.calledOnce, 'createCommitStatus was not called');
      let args = github.inst(9988).repos.createCommitStatus.firstCall.args[0];
      assert.equal(args.owner, 'TaskclusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, COMMIT_SHA);
      assert.equal(args.state, state);
      assert(args.target_url.startsWith(URL_PREFIX));
      let taskGroupId = args.target_url.replace(URL_PREFIX, '').trim();
      assert.equal(taskGroupId, TASKGROUPID);
    }

    async function assertBuildState(state) {
      let [build] = await helper.db.fns.get_github_build_pr(TASKGROUPID);
      assert.equal(build.state, state);
    }

    test('taskgroup success gets a success status', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-group-resolved',
        routingKey: 'primary.foo.tc-gh-devel.foo',
        taskId: null,
      });
      await assertStatusUpdate('success');
      await assertBuildState('success');
    });

    test('task failure gets a failure status', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-failed',
        routingKey: 'route.statuses',
        taskId: null,
      });
      await assertStatusUpdate('failure');
      await assertBuildState('failure');
    });

    test('task exception gets a failure status', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-exception',
        routingKey: 'route.statuses',
        taskId: null,
      });
      await assertStatusUpdate('failure');
      await assertBuildState('failure');
    });
    test('task rerun sets status to pending from running', async function() {
      await addBuild({ state: 'success', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-running',
        routingKey: 'route.statuses',
        runId: 0,
        state: 'running',
      });
      await assertStatusUpdate('pending');
      await assertBuildState('pending');
    });
    test('task rerun sets status to pending', async function() {
      await addBuild({ state: 'success', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-pending',
        routingKey: 'route.statuses',
        runId: 1,
        state: 'pending',
      });
      await assertStatusUpdate('pending');
      await assertBuildState('pending');
    });
    test('task rerun sets status back from failure to pending', async function() {
      await addBuild({ state: 'failure', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-running',
        routingKey: 'route.statuses',
        runId: 0,
        state: 'running',
      });
      await assertStatusUpdate('pending');
      await assertBuildState('pending');
    });
    test('task running not changing state if it is pending', async function() {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-running',
        routingKey: 'route.statuses',
        runId: 0,
        state: 'running',
      });
      assert(github.inst(9988).repos.createCommitStatus.calledOnce === false);
      await assertBuildState('pending');
    });
    test('task failure does not change cancelled build state', async function() {
      await addBuild({ state: 'cancelled', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-failed',
        routingKey: 'route.statuses',
        runId: 0,
        state: 'running',
      });
      await assertBuildState('cancelled');
    });
  });

  suite('Checks API: result status handler', function () {
    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P32o2';
    setup(function () {
      sinon.stub(utils, "throttleRequest").returns({ status: 404, response: { error: { text: "Resource not found" } } });
    });

    teardown(async function () {
      await helper.db.fns.delete_github_build(TASKGROUPID);
      sinon.restore();
    });

    const TASKID = 'banana';
    const CONCLUSIONS = { // maps status communicated by the queue service to github checkrun conclusions
      /*eslint-disable quote-props*/
      'completed': 'success',
      'failed': 'failure',
      'exception': 'failure',
      'deadline-exceeded': 'timed_out',
      'canceled': 'cancelled',
      'claim-expired': 'failure',
      'worker-shutdown': 'neutral', // means: will be retried
      'malformed-payload': 'action_required', // like, "correct your task definition"
      'resource-unavailable': 'failure',
      'internal-error': 'failure',
      'intermittent-task': 'neutral', // means: will be retried
    };
    const STARTED = '2024-07-16T18:23:18.118Z';
    const RESOLVED = '2024-07-17T18:23:18.118Z';

    async function assertChecksUpdate(state) {
      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let args = github.inst(9988).checks.update.firstCall.args[0];
      assert.equal(args.owner, 'TaskclusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.check_run_id, '22222');
      assert.equal(args.conclusion, CONCLUSIONS[state]);
    }

    function assertChecksCreate(state) {
      assert(github.inst(9988).checks.create.called, 'checks.create was not called');

      github.inst(9988).checks.create.firstCall.args.forEach(args => {
        if (args.state === state) {
          assert.equal(args.owner, 'TaskclusterRobot');
          assert.equal(args.repo, 'hooks-testing');
          assert.equal(args.sha, COMMIT_SHA);
          debug('Created task group: ' + args.target_url);
          assert(args.target_url.startsWith(URL_PREFIX));
          let taskGroupId = args.target_url.substr(URL_PREFIX.length);
          assert.equal(taskGroupId, TASKGROUPID);
          assert.equal(/Taskcluster \((.*)\)/.exec(args.context)[1], 'push');
        }
      });
    }

    test('task success gets a success check result', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });
      await assertChecksUpdate('completed');
    });

    test('task failure gets a failure check result', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-failed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'failed',
        state: 'failed',
      });
      await assertChecksUpdate('failed');
    });

    test('task exception gets a failure check result', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-exception',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'resource-unavailable',
        state: 'exception',
      });
      await assertChecksUpdate('failed');
    });

    test('intermittent task with retries left gets neutral check result', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-exception',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'intermittent-task',
        state: 'exception',
        retriesLeft: 2,
      });
      await assertChecksUpdate('intermittent-task');
    });

    test('intermittent task with no retries left gets failure check result', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-exception',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'intermittent-task',
        state: 'exception',
        retriesLeft: 0,
      });
      // For intermittent tasks with no retries left, we expect 'failure' conclusion
      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let args = github.inst(9988).checks.update.firstCall.args[0];
      assert.equal(args.owner, 'TaskclusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.check_run_id, '22222');
      assert.equal(args.conclusion, 'failure');
    });

    test('successful task started by decision task gets a success comment', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });
      await assertChecksCreate('completed');
    });

    test('Undefined state/reasonResolved in the task exchange message -> neutral status, log error', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
        reasonResolved: 'banana',
        state: 'completed',
      });
      await assertChecksCreate('neutral');

      const monitor = await helper.load('monitor');
      assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'monitor.error' && Severity === LEVELS.err));
      monitor.manager.reset();
    });

    test('successfully adds custom check run text from an artifact', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_CHECKRUN_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 404 })
        .onSecondCall()
        .returns({ status: 200, text: CUSTOM_CHECKRUN_TEXT })
        .onThirdCall()
        .returns({ status: 404 });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_CHECKRUN_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
        started: STARTED,
        resolved: RESOLVED,
      });

      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let [args] = github.inst(9988).checks.update.firstCall.args;
      /* eslint-disable comma-dangle */
      assert.strictEqual(
        args.output.text,
        `[${CHECKRUN_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_CHECKRUN_TASKID}) | [${CHECKLOGS_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_CHECKRUN_TASKID}/runs/0/logs/live/public/logs/live.log) | [${CHECK_TASK_GROUP_TEXT}](${libUrls.testRootUrl()}/tasks/groups/${TASKGROUPID})\n### Task Status\nStarted: ${STARTED}\nResolved: ${RESOLVED}\nTask Execution Time: 1 day\nTask Status: **completed**\nReason Resolved: **completed**\nTaskId: **${CUSTOM_CHECKRUN_TASKID}**\nRunId: **0**\n### Artifacts\n${buildArtifactLinks(50, CUSTOM_CHECKRUN_TASKID)}\n${CUSTOM_CHECKRUN_TEXT}\n`
      );
      /* eslint-enable comma-dangle */
      sinon.restore();
    });

    test('successfully adds live log text from an artifact', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_CHECKRUN_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 200, text: LIVE_LOG_TEXT })
        .onSecondCall()
        .returns({ status: 404 })
        .onThirdCall()
        .returns({ status: 404 });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_CHECKRUN_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
        started: STARTED,
        resolved: RESOLVED,
      });

      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let [args] = github.inst(9988).checks.update.firstCall.args;
      /* eslint-disable comma-dangle */
      assert.strictEqual(
        args.output.text,
        `[${CHECKRUN_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_CHECKRUN_TASKID}) | [${CHECKLOGS_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_CHECKRUN_TASKID}/runs/0/logs/live/public/logs/live.log) | [${CHECK_TASK_GROUP_TEXT}](${libUrls.testRootUrl()}/tasks/groups/${TASKGROUPID})\n### Task Status\nStarted: ${STARTED}\nResolved: ${RESOLVED}\nTask Execution Time: 1 day\nTask Status: **completed**\nReason Resolved: **completed**\nTaskId: **${CUSTOM_CHECKRUN_TASKID}**\nRunId: **0**\n### Artifacts\n${buildArtifactLinks(50, CUSTOM_CHECKRUN_TASKID)}\n\n---\n\n\`\`\`bash\n${LIVE_LOG_TEXT}\n\`\`\`\n`
      );
      /* eslint-enable comma-dangle */
      sinon.restore();
    });

    test('successfully adds live log text from an artifact with a custom livelog name', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_LIVELOG_NAME_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 200, text: LIVE_LOG_TEXT })
        .onSecondCall()
        .returns({ status: 404 })
        .onThirdCall()
        .returns({ status: 404 });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_LIVELOG_NAME_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
        started: STARTED,
        resolved: RESOLVED,
      });

      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let [args] = github.inst(9988).checks.update.firstCall.args;
      /* eslint-disable comma-dangle */
      assert.strictEqual(
        args.output.text,
        `[${CHECKRUN_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_LIVELOG_NAME_TASKID}) | [${CHECKLOGS_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_LIVELOG_NAME_TASKID}/runs/0/logs/live/apple/banana.log) | [${CHECK_TASK_GROUP_TEXT}](${libUrls.testRootUrl()}/tasks/groups/${TASKGROUPID})\n### Task Status\nStarted: ${STARTED}\nResolved: ${RESOLVED}\nTask Execution Time: 1 day\nTask Status: **completed**\nReason Resolved: **completed**\nTaskId: **${CUSTOM_LIVELOG_NAME_TASKID}**\nRunId: **0**\n### Artifacts\n${buildArtifactLinks(50, CUSTOM_LIVELOG_NAME_TASKID)}\n\n---\n\n\`\`\`bash\n${LIVE_LOG_TEXT}\n\`\`\`\n`
      );
      /* eslint-enable comma-dangle */
      sinon.restore();
    });

    test('ignores when list artifacts sends 404', async function () {
      handlers.queueClient.listArtifacts = async () => {
        const error = new Error('Not found');
        error.statusCode = 404;
        error.errorCoe = 'ResourceNotFoundz';
        throw error;
      };
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_LIVELOG_NAME_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 200, text: LIVE_LOG_TEXT })
        .onSecondCall()
        .returns({ status: 404 })
        .onThirdCall()
        .returns({ status: 404 });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_LIVELOG_NAME_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
        started: STARTED,
        resolved: RESOLVED,
      });

      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      assert(github.inst(9988).repos.createCommitComment.notCalled, 'createCommitComment should not be called'); // not expecting 404 to be reported
      let [args] = github.inst(9988).checks.update.firstCall.args;
      /* eslint-disable comma-dangle */
      assert.strictEqual(
        args.output.text,
        `[${CHECKRUN_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_LIVELOG_NAME_TASKID}) | [${CHECKLOGS_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_LIVELOG_NAME_TASKID}/runs/0/logs/live/apple/banana.log) | [${CHECK_TASK_GROUP_TEXT}](${libUrls.testRootUrl()}/tasks/groups/${TASKGROUPID})\n### Task Status\nStarted: ${STARTED}\nResolved: ${RESOLVED}\nTask Execution Time: 1 day\nTask Status: **completed**\nReason Resolved: **completed**\nTaskId: **${CUSTOM_LIVELOG_NAME_TASKID}**\nRunId: **0**\n\n---\n\n\`\`\`bash\n${LIVE_LOG_TEXT}\n\`\`\`\n`
      );
      /* eslint-enable comma-dangle */
      sinon.restore();
    });

    test('fails to get custom check run text from an artifact - should log an error', async function () {
      // note: production code doesn't throw the error, just logs it, so the handlers is not interrupted
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_CHECKRUN_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 418, response: { error: { text: "I'm a tea pot" } } })
        .onSecondCall()
        .returns({ status: 404 });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_CHECKRUN_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });
      const monitor = await helper.load('monitor');
      assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'monitor.error' && Severity === LEVELS.err));
      monitor.manager.reset();
      sinon.restore();
    });

    test('successfully adds custom check run annotations from an artifact', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_CHECKRUN_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 200, text: LIVE_LOG_TEXT })
        .onSecondCall()
        .returns({ status: 404 })
        .onThirdCall()
        .returns({ status: 200, text: CUSTOM_CHECKRUN_ANNOTATIONS });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_CHECKRUN_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });

      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let [args] = github.inst(9988).checks.update.firstCall.args;
      assert.deepStrictEqual(args.output.annotations, JSON.parse(CUSTOM_CHECKRUN_ANNOTATIONS));
      sinon.restore();
    });

    test('generate error report when the returned text is not valid JSON', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_CHECKRUN_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 404 })
        .onSecondCall()
        .returns({ status: 404 })
        .onThirdCall()
        .returns({ status: 200, text: "{{{invalid json!!" });

      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_CHECKRUN_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });
      let args = github.inst(9988).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskclusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].commit_sha, COMMIT_SHA);
      assert(args[0][0].body.indexOf('Custom annotations artifact public/github/customCheckRunAnnotations.json on task apple does not contain valid JSON.\n') !== -1);
      sinon.restore();
    });

    test('fails to get custom check run annotations from an artifact - should log an error', async function () {
      // note: production code doesn't throw the error, just logs it, so the handlers is not interrupted
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_CHECKRUN_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 404 })
        .onSecondCall()
        .returns({ status: 418, response: { error: { text: "I'm a tea pot" } } });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_CHECKRUN_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
      });
      const monitor = await helper.load('monitor');
      assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'monitor.error' && Severity === LEVELS.err));
      monitor.manager.reset();
      sinon.restore();
    });

    test('skip status update when build is not defined', async function () {
      // Some tasks will be create without github events, like periodic cron hooks
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
      });
      assert.equal(false, github.inst(9988).checks.update.called);
      assert.equal(false, github.inst(9988).checks.create.called);
    });

    test('undefined started and resolved timestamps in check run output', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: CUSTOM_LIVELOG_NAME_TASKID });
      sinon.restore();
      sinon.stub(utils, "throttleRequest")
        .onFirstCall()
        .returns({ status: 200, text: LIVE_LOG_TEXT })
        .onSecondCall()
        .returns({ status: 404 })
        .onThirdCall()
        .returns({ status: 404 });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: CUSTOM_LIVELOG_NAME_TASKID,
        reasonResolved: 'completed',
        state: 'completed',
        started: undefined,
        resolved: undefined,
      });

      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let [args] = github.inst(9988).checks.update.firstCall.args;
      /* eslint-disable comma-dangle */
      assert.strictEqual(
        args.output.text,
        `[${CHECKRUN_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_LIVELOG_NAME_TASKID}) | [${CHECKLOGS_TEXT}](${libUrls.testRootUrl()}/tasks/${CUSTOM_LIVELOG_NAME_TASKID}/runs/0/logs/live/apple/banana.log) | [${CHECK_TASK_GROUP_TEXT}](${libUrls.testRootUrl()}/tasks/groups/${TASKGROUPID})\n### Task Status\nStarted: n/a\nResolved: n/a\nTask Execution Time: n/a\nTask Status: **completed**\nReason Resolved: **completed**\nTaskId: **${CUSTOM_LIVELOG_NAME_TASKID}**\nRunId: **0**\n### Artifacts\n${buildArtifactLinks(50, CUSTOM_LIVELOG_NAME_TASKID)}\n\n---\n\n\`\`\`bash\n${LIVE_LOG_TEXT}\n\`\`\`\n`
      );
      /* eslint-enable comma-dangle */
      sinon.restore();
    });
  });

  suite('Checks API: rerequest task status handler', function () {
    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    setup(function () {
      sinon.stub(utils, "throttleRequest").returns({ status: 404, response: { error: { text: "Resource not found" } } });
    });

    teardown(async function () {
      await helper.db.fns.delete_github_build(TASKGROUPID);
      sinon.restore();
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P32o3';
    const TASKID = 'rerequested';

    async function assertCheckRunStatus(status, conclusion) {
      assert(github.inst(9988).checks.create.called === false, 'checks.create should not be called');
      assert(github.inst(9988).checks.update.calledOnce, 'checks.update was not called');
      let args = github.inst(9988).checks.update.firstCall.args[0];
      assert.equal(args.owner, 'TaskclusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.check_run_id, '22222');
      assert.equal(args.status, status);
      assert.equal(args.conclusion, conclusion);
    }

    function assertCheckRunCreated() {
      assert(github.inst(9988).checks.update.called === false, 'checks.update should not be called');
      assert(github.inst(9988).checks.create.called, 'checks.create was not called');

      let args = github.inst(9988).checks.create.firstCall.args[0];
      assert.equal(args.owner, 'TaskclusterRobot');
      assert.equal(args.repo, 'hooks-testing');
    }

    test('task is running gets a queued check result', async function () {
      await addBuild({ state: 'running', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-running',
        routingKey: 'route.checks',
        taskId: TASKID,
        runId: 0,
        state: 'running',
      });
      await assertCheckRunStatus('in_progress');
    });

    test('task is running gets a in_progress check result', async function () {
      await addBuild({ state: 'running', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-running',
        routingKey: 'route.checks',
        taskId: TASKID,
        state: 'running',
      });
      await assertCheckRunStatus('in_progress');
    });

    test('task is rerun and queued gets a queued check result and rerequested run', async function () {
      await addBuild({ state: 'running', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-running',
        routingKey: 'route.checks',
        taskId: TASKID,
        state: 'running',
        runId: 1, // means task was already completed, rerequest is expected
      });
      await assertCheckRunCreated();
    });

    test('task is completed after rerun', async function () {
      await addBuild({ state: 'completed', taskGroupId: TASKGROUPID });
      await addCheckRun({ taskGroupId: TASKGROUPID, taskId: TASKID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'route.checks',
        taskId: TASKID,
        state: 'completed',
        runId: 1,
      });
      assert(github.inst(9988).checks.create.called === false, 'Rerequest run should not be called');
      await assertCheckRunStatus('completed', 'success');
    });

  });

  suite('Statuses API: initial status handler', function () {
    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function () {
      await helper.db.fns.delete_github_build(TASKGROUPID);
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P5555';

    function assertStatusCreation(state) {
      assert(github.inst(9988).repos.createCommitStatus.called, 'createCommitStatus was not called');

      github.inst(9988).repos.createCommitStatus.firstCall.args.forEach(args => {
        if (args.state === state) {
          assert.equal(args.owner, 'TaskclusterRobot');
          assert.equal(args.repo, 'hooks-testing');
          assert.equal(args.sha, COMMIT_SHA);
          debug('Created task group: ' + args.target_url);
          assert(args.target_url.startsWith(URL_PREFIX));
          let taskGroupId = args.target_url.substr(URL_PREFIX.length);
          assert.equal(taskGroupId, TASKGROUPID);
          assert.equal(/Taskcluster-Test \((.*)\)/.exec(args.context)[1], 'push');
        }
      });
    }

    test('create pending status when task is defined', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-github/v1/task-group-creation-requested',
        routingKey: 'route.statuses',
      });
      assertStatusCreation('pending');
    });
  });

  suite('Checks API: initial status handler', function () {
    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function () {
      await helper.db.fns.delete_github_build(TASKGROUPID);
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P5555';
    const TASKID = 'banana';

    function assertStatusCreate(state) {
      assert(github.inst(9988).checks.create.called, 'createCommitStatus was not called');

      github.inst(9988).checks.create.firstCall.args.forEach(args => {
        if (args.state === state) {
          assert.equal(args.owner, 'TaskclusterRobot');
          assert.equal(args.repo, 'hooks-testing');
          assert.equal(args.sha, COMMIT_SHA);
          debug('Created task group: ' + args.target_url);
          assert(args.target_url.startsWith(URL_PREFIX));
          let taskGroupId = args.target_url.substr(URL_PREFIX.length);
          assert.equal(taskGroupId, TASKGROUPID);
          assert.equal(/Taskcluster \((.*)\)/.exec(args.context)[1], 'push');
        }
      });
    }

    test('create pending check result when task is defined', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-defined',
        routingKey: 'route.checks',
        taskId: TASKID,
      });
      assertStatusCreate('pending');
    });

    test('skip check when build is not defined', async function () {
      // Some tasks will be create without github events, like periodic cron hooks
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-defined',
        routingKey: 'route.checks',
        taskId: TASKID,
      });
      assert.equal(false, github.inst(9988).checks.create.called);
    });
  });

  suite('Statuses API: initial status handler', function () {
    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    teardown(async function () {
      await helper.db.fns.delete_github_build(TASKGROUPID);
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P5555';

    function assertStatusCreation(state) {
      assert(github.inst(9988).repos.createCommitStatus.called, 'createCommitStatus was not called');

      github.inst(9988).repos.createCommitStatus.firstCall.args.forEach(args => {
        if (args.state === state) {
          assert.equal(args.owner, 'TaskclusterRobot');
          assert.equal(args.repo, 'hooks-testing');
          assert.equal(args.sha, COMMIT_SHA);
          debug('Created task group: ' + args.target_url);
          assert(args.target_url.startsWith(URL_PREFIX));
          let taskGroupId = args.target_url.substr(URL_PREFIX.length);
          assert.equal(taskGroupId, TASKGROUPID);
          assert.equal(/Taskcluster-Test \((.*)\)/.exec(args.context)[1], 'push');
        }
      });
    }

    test('create pending status when task is defined', async function () {
      await addBuild({ state: 'pending', taskGroupId: TASKGROUPID });
      await simulateExchangeMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-github/v1/task-group-creation-requested',
        routingKey: 'route.statuses',
      });
      assertStatusCreation('pending');
    });
  });

  suite('Checks API: rerun handler', function () {
    const taskGroupId = 'AXB-sjV-SoCyibyq3P5555';
    const taskId = 'failingone';
    const checkSuiteId = '6781240077';
    const checkRunId = '6725570353';

    let reruns = [];
    let usedScopes = [];

    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    setup(() => {
      handlers.queueClient.use = (options) => {
        usedScopes.push(options);
        return {
          rerunTask: async (taskId) => {
            reruns.push(taskId);
          },
        };
      };
    });

    teardown(async function () {
      await helper.db.fns.delete_github_build(taskGroupId);
      reruns = [];
      usedScopes = [];
    });

    test('create task rerun', async function () {
      await addBuild({ state: 'failure', taskGroupId });
      await addCheckRun({ taskGroupId, taskId, checkSuiteId, checkRunId });

      // trigger exchange message
      const message = {
        exchange: 'exchange/taskcluster-github/v1/rerun',
        routingKey: 'primary.taskcluster.taskcluster',
        routes: [],
        payload: {
          organization: 'taskcluster',
          eventId: '26370a8b-b9b1-4f5d-b8d7-f8f9f8f8f8f8',
          installationId: INST_ID,
          checkRunId: 6725570353,
          checkSuiteId: 6781240077,
          version: 1,
          body: { tbd: 'true' },
          details: {
            'event.head.user.login': 'owlishDeveloper',
            'event.head.user.email': 'anotheruser@github.com',
            'event.head.repo.name': 'taskcluster',
          },
        },
      };

      const handlerComplete = new Promise((resolve, reject) => {
        handlers.handlerComplete = resolve;
        handlers.handlerRejected = reject;
      });
      await helper.fakePulseMessage(message);
      await handlerComplete;

      assert.equal(reruns.length, 1);
      assert.equal(reruns[0], taskId);
      assert.deepEqual(usedScopes, [{
        authorizedScopes: ['assume:repo:github.com/taskcluster/taskcluster:rerun'],
      }]);
    });
    test('do nothing if invalid payload is provided', async function () {
      await addBuild({ state: 'failure', taskGroupId });
      await addCheckRun({ taskGroupId, taskId, checkSuiteId, checkRunId });

      // trigger exchange message
      const message = {
        exchange: 'exchange/taskcluster-github/v1/rerun',
        routingKey: 'primary.taskcluster.taskcluster',
        routes: [],
        payload: {
          organization: 'taskcluster',
          eventId: '26370a8b-b9b1-4f5d-b8d7-f8f9f8f8f8f8',
          installationId: INST_ID,
          checkRunId: 'non-existant-id',
          checkSuiteId: 'not-a-number',
          version: 1,
          body: { tbd: 'true' },
          details: {
            'event.type': 'rerun',
            'event.head.user.login': 'owlishDeveloper',
            'event.head.user.id': 18102552,
            'event.head.user.email': 'anotheruser@github.com',
            'event.check.name': 'service-github',
            'event.check.run.id': 'non-existant-id',
            'event.check.run.url': 'https://api.github.com/repos/taskcluster/taskcluster/check-runs/non-existant-id',
            'event.check.suite.id': 'not-a-number',
            'event.check.suite.url': 'https://api.github.com/repos/taskcluster/taskcluster/check-suites/not-a-number',
            'event.head.repo.name': 'taskcluster',
          },
        },
      };

      const handlerComplete = new Promise((resolve, reject) => {
        handlers.handlerComplete = resolve;
        handlers.handlerRejected = reject;
      });
      await helper.fakePulseMessage(message);
      try {
        await handlerComplete;
      } catch (e) {
        assert.equal(e.message, 'No checkRun found for checkRunId non-existant-id and checkSuiteId not-a-number');
      }

      const monitor = await helper.load('monitor');
      assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'monitor.error' && Severity === LEVELS.err));
      monitor.manager.reset();
    });
  });
});
