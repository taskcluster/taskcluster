import taskcluster from 'taskcluster-client';
import testing from 'taskcluster-lib-testing';
import assert from 'assert';

suite(testing.suiteName(), function () {
  test('Main clients exposed', function () {
    assert.equal(taskcluster.Auth instanceof Function, true);
    assert.equal(taskcluster.AuthEvents instanceof Function, true);
    assert.equal(taskcluster.Github instanceof Function, true);
    assert.equal(taskcluster.GithubEvents instanceof Function, true);
    assert.equal(taskcluster.Hooks instanceof Function, true);
    assert.equal(taskcluster.HooksEvents instanceof Function, true);
    assert.equal(taskcluster.Index instanceof Function, true);
    assert.equal(taskcluster.Notify instanceof Function, true);
    assert.equal(taskcluster.NotifyEvents instanceof Function, true);
    assert.equal(taskcluster.Object instanceof Function, true);
    assert.equal(taskcluster.PurgeCache instanceof Function, true);
    assert.equal(taskcluster.Queue instanceof Function, true);
    assert.equal(taskcluster.QueueEvents instanceof Function, true);
    assert.equal(taskcluster.Secrets instanceof Function, true);
    assert.equal(taskcluster.WorkerManager instanceof Function, true);
    assert.equal(taskcluster.WorkerManagerEvents instanceof Function, true);
  });
});
