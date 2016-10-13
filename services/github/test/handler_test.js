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
  let helper = require('./helper');
  let assert = require('assert');
  let testing = require('taskcluster-lib-testing');
  let mocha = require('mocha');
  let load = require('../lib/main');
  let sinon = require('sinon');
  let slugid = require('slugid');

  let stubs = null;
  let Handlers = null;
  let handlers = null;
  mocha.beforeEach(async () => {
    // Fake scheduler createTaskGraph "implemementation"
    let scheduler = {
      createTaskGraph: (...rest) => {return {status: {taskGraphId: slugid.v4()}};},
    };

    // Stub out github operations that write and need higher permissions
    stubs = {};
    let github = await load('github', {profile: 'test', process: 'test'});
    stubs['comment'] = sinon.stub(github.repos, 'createCommitComment');

    Handlers = await load('handlers', {profile: 'test', process: 'test', scheduler, github});
    handlers = await Handlers.setup();
  });

  mocha.afterEach(async () => {
    await Handlers.terminate();
  });

  function publishMessage(user) {
    return helper.publisher.push({
      organization: 'TaskClusterRobot',
      details: {
        'event.type': 'push',
        'event.base.repo.branch': 'master',
        'event.head.repo.branch': 'master',
        'event.head.user.login': user,
        'event.head.repo.url': 'https://github.com/TaskClusterRobot/hooks-testing.git',
        'event.head.sha': 'baac77fbb0089838ad2c57eab598efe4241e0e8f',
        'event.head.ref': 'refs/heads/master',
        'event.base.sha': '337667546fe033bd729d80e5fde00c07b98ee37a',
        'event.head.user.email': 'bstack@mozilla.com',
      },
      repository: 'hooks-testing',
      version: 1,
    });
  }

  test('valid push (owner === owner)', async function(done) {
    await publishMessage('TaskClusterRobot');

    await testing.poll(async () => {
      assert(stubs.comment.called);
    }).catch(done);
    try {
      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, 'baac77fbb0089838ad2c57eab598efe4241e0e8f');
      assert(stubs.comment.args[0][0].body.startsWith(
        'TaskCluster: https://tools.taskcluster.net/task-graph-inspector/#'));
      assert(stubs.comment.args[0][0].body.endsWith('/'));
      done();
    } catch (e) {
      done(e);
    }
  });

  test('insufficient permissions to check membership', async function(done) {
    await publishMessage('imbstack');

    await testing.poll(async () => {
      assert(stubs.comment.called);
    }).catch(done);
    try {
      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, 'baac77fbb0089838ad2c57eab598efe4241e0e8f');
      assert(stubs.comment.args[0][0].body.startsWith(
        'Taskcluster does not have permission to check for repository collaborators'));
      done();
    } catch (e) {
      done(e);
    }
  });

  test('invalid push', async function(done) {
    await publishMessage('somebodywhodoesntexist');

    await testing.poll(async () => {
      assert(stubs.comment.called);
    }).catch(done);
    try {
      assert(stubs.comment.calledOnce);
      assert.equal(stubs.comment.args[0][0].owner, 'TaskClusterRobot');
      assert.equal(stubs.comment.args[0][0].repo, 'hooks-testing');
      assert.equal(stubs.comment.args[0][0].sha, 'baac77fbb0089838ad2c57eab598efe4241e0e8f');
      assert(stubs.comment.args[0][0].body.startsWith(
        'TaskCluster: @somebodywhodoesntexist does not have permission'));
      done();
    } catch (e) {
      done(e);
    }
  });
});
