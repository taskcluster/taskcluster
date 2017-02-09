/**
 * This tests the event handlers, faking out all of the services they
 * interact with.
 */
suite('handlers', () => {
  let debug = require('debug')('test');
  let helper = require('./helper');
  let assert = require('assert');
  let testing = require('taskcluster-lib-testing');
  let load = require('../lib/main');
  let sinon = require('sinon');
  let slugid = require('slugid');

  let github = null;
  let handlers = null;

  let URL_PREFIX = 'https://tools.taskcluster.net/task-group-inspector/#/';

  setup(async () => {
    github = await helper.load('github');

    handlers = await helper.load('handlers');

    // stub out `createTasks` so that we don't actually create tasks
    handlers.oldCreateTasks = handlers.createTasks;
    handlers.createTasks = sinon.stub();

    await handlers.setup({noConnect: true});

    // set up the allowPullRequests key
    github.inst(5828).setRepoInfo({
      owner: 'TaskClusterRobot',
      repo: 'hooks-testing',
      info: {default_branch: 'development'},
    });
  });

  teardown(async () => {
    handlers.createTasks = handlers.oldCreateTasks;
    await handlers.terminate();
  });

  suite('jobHandler', function() {
    function simulateJobMessage({user, head, base, eventType='push'}) {
      // set up to resolve when the handler has finished (even if it finishes with error)
      return new Promise((resolve, reject) => {
        handlers.handlerComplete = resolve;
        handlers.handlerRejected = reject;

        debug(`publishing ${JSON.stringify({user, head, base, eventType})}`);
        const message = {
          payload: {
            organization: 'TaskClusterRobot',
            details: {
              'event.type': eventType,
              'event.base.repo.branch': 'tc-gh-tests',
              'event.head.repo.branch': 'tc-gh-tests',
              'event.head.user.login': user,
              'event.head.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
              'event.head.sha': head || '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
              'event.head.ref': 'refs/heads/tc-gh-tests',
              'event.base.sha': base || '2bad4edf90e7d4fb4643456a4df333da348bbed4',
              'event.head.user.id': 190790,
            },
            repository: 'hooks-testing',
            eventId: '26370a80-ed65-11e6-8f4c-80082678482d',
            installationId: 5828,
            version: 1,
          },
        };

        handlers.jobListener.emit('message', message);
      });
    }

    test('valid push (owner is collaborator) creates a taskGroup', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      await simulateJobMessage({user: 'TaskClusterRobot'});

      assert(github.inst(5828).repos.createStatus.calledOnce, 'Status was never updated!');
      assert(handlers.createTasks.calledWith({scopes: sinon.match.array, tasks: sinon.match.array}));
      let args = github.inst(5828).repos.createStatus.firstCall.args[0];
      assert.equal(args.owner, 'TaskClusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(args.state, 'pending');
      assert.equal(args.description, 'TaskGroup: Pending (for push)');
      assert.equal(/Taskcluster \((.*)\)/.exec(args.context)[1], 'push');
      debug('Created task group: ' + args.target_url);
      assert(args.target_url.startsWith(URL_PREFIX));
      let taskGroupId = args.target_url.substr(URL_PREFIX.length);
      let build = await helper.Builds.load({taskGroupId});
      assert.equal(build.organization, 'TaskClusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(build.state, 'pending');
    });

    test('valid pull_request (user is collaborator) creates a taskGroup', async function() {
      github.inst(5828).setRepoCollaborator({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        collabuser: 'goodBuddy',
      });
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      await simulateJobMessage({user: 'goodBuddy', eventType: 'pull_request.opened'});

      assert(github.inst(5828).repos.createStatus.calledOnce, 'Status was never updated!');
      assert(handlers.createTasks.calledWith({scopes: sinon.match.array, tasks: sinon.match.array}));
      let args = github.inst(5828).repos.createStatus.firstCall.args[0];
      assert.equal(args.owner, 'TaskClusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(args.state, 'pending');
      assert.equal(/Taskcluster \((.*)\)/.exec(args.context)[1], 'pull_request');
      debug('Created task group: ' + args.target_url);
      assert(args.target_url.startsWith(URL_PREFIX));
      let taskGroupId = args.target_url.substr(URL_PREFIX.length);
      let build = await helper.Builds.load({taskGroupId});
      assert.equal(build.organization, 'TaskClusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(build.state, 'pending');
    });

    test('valid push (but not collaborator) creates a taskGroup', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      await simulateJobMessage({user: 'TaskClusterCollaborator', eventType: 'push'});

      assert(github.inst(5828).repos.createStatus.calledOnce, 'Status was never updated!');
      let args = github.inst(5828).repos.createStatus.firstCall.args[0];
      assert.equal(args.owner, 'TaskClusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(args.state, 'pending');
      debug('Created task group: ' + args.target_url);
      assert(args.target_url.startsWith(URL_PREFIX));
      let taskGroupId = args.target_url.substr(URL_PREFIX.length);
      let build = await helper.Builds.load({taskGroupId});
      assert.equal(build.organization, 'TaskClusterRobot');
      assert.equal(build.repository, 'hooks-testing');
      assert.equal(build.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(build.state, 'pending');
    });

    test('invalid YAML results in a comment', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./invalid-yaml.json'),
      });
      await simulateJobMessage({user: 'TaskClusterRobot'});

      assert(github.inst(5828).repos.createStatus.callCount === 0, 'Status was unexpectedly updated!');
      assert(github.inst(5828).repos.createCommitComment.calledOnce);
      let args = github.inst(5828).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskClusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(args[0][0].body.indexOf('data should NOT have additional properties') !== -1);
    });

    test('error creating task is reported correctly', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      handlers.createTasks.returns(Promise.reject({body: {error: 'oh noes'}}));
      await simulateJobMessage({user: 'TaskClusterRobot'});

      assert(github.inst(5828).repos.createStatus.callCount === 1, 'Status was not updated!');
      assert(github.inst(5828).repos.createCommitComment.calledOnce);
      let args = github.inst(5828).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskClusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(args[0][0].body.indexOf('oh noes') !== -1);
    });

    test('not an org member or collaborator is reported correctly for pull requests', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      await simulateJobMessage({user: 'imbstack', eventType: 'pull_request.opened'});

      assert(github.inst(5828).repos.createCommitComment.calledOnce);
      let args = github.inst(5828).repos.createCommitComment.args;
      assert.equal(args[0][0].owner, 'TaskClusterRobot');
      assert.equal(args[0][0].repo, 'hooks-testing');
      assert.equal(args[0][0].sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(args[0][0].body.indexOf('No TaskCluster jobs started for this pull request') !== -1);
    });

    test('specifying allowPullRequests: public in the default branch allows all', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: {allowPullRequests: 'public'},
      });
      await simulateJobMessage({user: 'imbstack', eventType: 'pull_request.opened'});

      assert(github.inst(5828).repos.createStatus.callCount === 1, 'Status was not updated!');
      assert(github.inst(5828).repos.createCommitComment.callCount === 0);
    });

    test('specifying allowPullRequests: collaborators in the default branch disallows public', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: 'development', // default branch
        content: {allowPullRequests: 'collaborators'},
      });
      await simulateJobMessage({user: 'imbstack', eventType: 'pull_request.opened'});

      assert(github.inst(5828).repos.createStatus.callCount === 0);
      assert(github.inst(5828).repos.createCommitComment.callCount === 1);
    });

    test('user name not checked for pushes, so status is created', async function() {
      github.inst(5828).setTaskclusterYml({
        owner: 'TaskClusterRobot',
        repo: 'hooks-testing',
        ref: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
        content: require('./valid-yaml.json'),
      });
      await simulateJobMessage({user: 'imbstack', eventType: 'push'});

      assert(github.inst(5828).repos.createStatus.calledOnce, 'Status was never updated!');
      assert(github.inst(5828).repos.createCommitComment.callCount === 0);
    });
  });

  suite('statusHandler', function() {
    teardown(async function() {
      await helper.Builds.remove({taskGroupId: TASKGROUPID}, true);
    });

    const TASKGROUPID = 'AXB-sjV-SoCyibyq3P32ow';
    async function addBuild({state, taskGroupId}) {
      debug(`adding Build row for ${taskGroupId} in state ${state}`);
      await helper.Builds.create({
        organization: 'TaskClusterRobot',
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

    function simulateStatusMessage({taskGroupId, exchange}) {
      // set up to resolve when the handler has finished (even if it finishes with error)
      return new Promise((resolve, reject) => {
        handlers.handlerComplete = resolve;

        debug(`publishing ${JSON.stringify({taskGroupId, exchange})}`);
        const message = {
          exchange,
          payload: {
            status: {taskGroupId},
          },
        };

        handlers.statusListener.emit('message', message);
      });
    }

    async function assertStatusUpdate(state) {
      assert(github.inst(9988).repos.createStatus.calledOnce, 'createStatus was not called');
      let args = github.inst(9988).repos.createStatus.firstCall.args[0];
      assert.equal(args.owner, 'TaskClusterRobot');
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

    test('task success gets a success comment', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateStatusMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
      });
      await assertStatusUpdate('success');
      await assertBuildState('success');
    });

    test('task failure gets a failure comment', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateStatusMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-failed',
      });
      await assertStatusUpdate('failure');
      await assertBuildState('failure');
    });

    test('task exception gets a failure comment', async function() {
      await addBuild({state: 'pending', taskGroupId: TASKGROUPID});
      await simulateStatusMessage({
        taskGroupId: TASKGROUPID,
        exchange: 'exchange/taskcluster-queue/v1/task-exception',
      });
      await assertStatusUpdate('failure');
      await assertBuildState('failure');
    });
  });
});
