/**
 * This is a big huge integration test that reaches out to
 * all corners of the known universe and touches everything it can.
 *
 * It is super gross.
 *
 * However, the task that taskcluster-github achieves is a super gross
 * one. We're sorta left with the choice of faking all of our interactions
 * with Github or doing this. We've chosen this route for now and can
 * revisit later if it is a pain.
 */
suite('handlers', () => {
  let debug = require('debug')('test');
  let helper = require('./helper');
  let assert = require('assert');
  let testing = require('taskcluster-lib-testing');
  let load = require('../lib/main');
  let sinon = require('sinon');
  let slugid = require('slugid');

  let stubs = null;
  let handlers = null;

  let URL_PREFIX = 'https://tools.taskcluster.net/task-group-inspector/#/';

  setup(async () => {
    // Stub out github operations that write and need higher permissions
    stubs = {};
    let github = await load('github', {profile: 'test', process: 'test'});
    stubs['comment'] = sinon.stub(github.repos, 'createCommitComment');
    stubs['status'] = sinon.stub(github.repos, 'createStatus');

    handlers = await load('handlers', {profile: 'test', process: 'test', github});
    await handlers.setup({noConnect: true});
  });

  teardown(async () => {
    await handlers.terminate();
  });

  suite('jobHandler', function() {
    function simulateJobMessage({user, head, base}) {
      // set up to resolve when the handler has finished (even if it finishes with error)
      return new Promise((resolve, reject) => {
        handlers.handlerComplete = resolve;

        debug(`publishing ${JSON.stringify({user, head, base})}`);
        const message = {
          payload: {
            organization: 'TaskClusterRobot',
            details: {
              'event.type': 'push',
              'event.base.repo.branch': 'tc-gh-tests',
              'event.head.repo.branch': 'tc-gh-tests',
              'event.head.user.login': user,
              'event.head.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
              'event.head.sha': head || '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
              'event.head.ref': 'refs/heads/tc-gh-tests',
              'event.base.sha': base || '2bad4edf90e7d4fb4643456a4df333da348bbed4',
              //'event.head.user.email': 'bstack@mozilla.com',
              'event.head.user.id': 190790,
            },
            repository: 'hooks-testing',
            installationId: 5828,
            version: 1,
          },
        };

        handlers.jobListener.emit('message', message);
      });
    }

    test('valid push (owner === owner) creates a taskGroup', async function() {
      await simulateJobMessage({user: 'TaskClusterRobot'});

      assert(stubs.status.calledOnce, 'Status was never updated!');
      let args = stubs.status.firstCall.args[0];
      assert.equal(args.owner, 'TaskClusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(args.state, 'pending');
      debug('Created task group: ' + args.target_url);
      assert(args.target_url.startsWith(URL_PREFIX));
      let taskGroupId = args.target_url.replace(URL_PREFIX, '').trim();

      if (typeof taskGroupId !== 'string') {
        throw new Error(`${taskGroupId} is not a valid taskGroupId`);
        return;
      }
    });

    test('trying to use scopes outside the assigned', async function() {
      await simulateJobMessage({
        user: 'TaskClusterRobot',
        head: '52f8ebc527e8af90e7d647f22aa07dfc5ad9b280',
        base: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
      });

      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, '52f8ebc527e8af90e7d647f22aa07dfc5ad9b280');
      assert(stubs.comment.args[0][0].body.indexOf('auth:statsum:taskcluster-github') !== -1);
    });

    test('insufficient permissions to check membership', async function() {
      await simulateJobMessage({user: 'imbstack'});

      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(stubs.comment.args[0][0].body.startsWith(
        'Taskcluster does not have permission to check for repository collaborators'));
    });

    test('invalid push', async function() {
      await simulateJobMessage({user: 'somebodywhodoesntexist'});

      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(stubs.comment.args[0][0].body.startsWith(
        'TaskCluster: @somebodywhodoesntexist does not have permission'));
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
      assert(stubs.status.calledOnce, 'Status was not updated');
      let args = stubs.status.firstCall.args[0];
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
