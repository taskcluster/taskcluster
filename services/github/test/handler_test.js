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
  let Handlers = null;
  let handlers = null;

  setup(async () => {
    // Stub out github operations that write and need higher permissions
    stubs = {};
    let github = await load('github', {profile: 'test', process: 'test'});
    stubs['comment'] = sinon.stub(github.repos, 'createCommitComment');
    stubs['status'] = sinon.stub(github.repos, 'createStatus');

    Handlers = await load('handlers', {profile: 'test', process: 'test', github});
    handlers = await Handlers.setup();
  });

  teardown(async () => {
    await Handlers.terminate();
  });

  function publishMessage({user, head, base}) {
    return helper.publisher.push({
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
        'event.head.user.email': 'bstack@mozilla.com',
      },
      repository: 'hooks-testing',
      version: 1,
    });
  }

  test('valid push (owner === owner)', async function(done) {
    await publishMessage({user: 'TaskClusterRobot'});

    let urlPrefix = 'https://tools.taskcluster.net/push-inspector/#/';
    let taskGroupId = null;

    await testing.poll(async () => {
      assert(stubs.status.calledOnce);
    }, 20, 1000).catch(done);
    try {
      assert(stubs.status.calledOnce, 'Status was never updated!');
      let args = stubs.status.firstCall.args[0];
      assert.equal(args.owner, 'TaskClusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(args.state, 'pending');
      debug('Created task group: ' + args.target_url);
      assert(args.target_url.startsWith(urlPrefix));
      taskGroupId = args.target_url.replace(urlPrefix, '').trim();
    } catch (e) {
      done(e);
      return;
    }

    if (typeof taskGroupId !== 'string') {
      done(new Error(`${taskGroupId} is not a valid taskGroupId`));
      return;
    }
    await Promise.all((await helper.queue.listTaskGroup(taskGroupId)).tasks.map(async (task) => {
      await helper.queue.claimTask(task.status.taskId, 0, {
        workerGroup:  'dummy-workergroup',
        workerId:     'dummy-worker',
      });
      await testing.sleep(100);
      await helper.queue.reportCompleted(task.status.taskId, 0);
    })).catch(done);

    await testing.poll(async () => {
      assert(stubs.status.calledTwice);
    }).catch(done);
    try {
      assert(stubs.status.calledTwice, 'Status was only updated once');
      let args = stubs.status.secondCall.args[0];
      assert.equal(args.owner, 'TaskClusterRobot');
      assert.equal(args.repo, 'hooks-testing');
      assert.equal(args.sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert.equal(args.state, 'success');
      assert(args.target_url.startsWith(urlPrefix));
      taskGroupId = args.target_url.replace(urlPrefix, '').trim();
    } catch (e) {
      done(e);
      return;
    }
    done();
  });

  test('trying to use scopes outside the assigned', async function(done) {
    await publishMessage({
      user: 'TaskClusterRobot',
      head: '52f8ebc527e8af90e7d647f22aa07dfc5ad9b280',
      base: '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf',
    });

    await testing.poll(async () => {
      assert(stubs.comment.called);
    }).catch(done);
    try {
      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, '52f8ebc527e8af90e7d647f22aa07dfc5ad9b280');
      assert(stubs.comment.args[0][0].body.indexOf('auth:statsum:taskcluster-github') !== -1);
      done();
    } catch (e) {
      done(e);
    }
  });

  test('insufficient permissions to check membership', async function(done) {
    await publishMessage({user: 'imbstack'});

    await testing.poll(async () => {
      assert(stubs.comment.called);
    }).catch(done);
    try {
      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(stubs.comment.args[0][0].body.startsWith(
        'Taskcluster does not have permission to check for repository collaborators'));
      done();
    } catch (e) {
      done(e);
    }
  });

  test('invalid push', async function(done) {
    await publishMessage({user: 'somebodywhodoesntexist'});

    await testing.poll(async () => {
      assert(stubs.comment.called);
    }).catch(done);
    try {
      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, '03e9577bc1ec60f2ff0929d5f1554de36b8f48cf');
      assert(stubs.comment.args[0][0].body.startsWith(
        'TaskCluster: @somebodywhodoesntexist does not have permission'));
      done();
    } catch (e) {
      done(e);
    }
  });
});
