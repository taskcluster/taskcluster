import assert from 'assert';
import taskcluster from 'taskcluster-client';
import { default as _load } from '../src/main.js';
import { stickyLoader } from 'taskcluster-lib-testing';

export const load = stickyLoader(_load);

suiteSetup(async function() {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

/**
 * Set up a fake tc-queue object that supports only the `task` method,
 * and inject that into the loader.  This is injected regardless of
 * whether we are mocking.
 *
 * The component is available at `helper.queue`.
 */
export const rootUrl = 'http://localhost:8080';

export const withFakeQueue = () => {
  const fakeQueue = {};
  suiteSetup(function() {
    const queue = stubbedQueue(fakeQueue);
    load.inject('queue', queue);
  });
  return fakeQueue;
};

/**
 * make a queue object with the `task` method stubbed out, and with
 * an `addTask` method to add fake tasks.
 */
const stubbedQueue = (fakeQueue) => {
  const tasks = {};

  // responses from claimWork
  fakeQueue.claimableWork = [];

  // {taskId: resolution}
  fakeQueue.taskResolutions = {};

  fakeQueue.assertTaskResolved = (taskId, resolution) => {
    return assert.deepEqual(fakeQueue.taskResolutions[taskId], resolution);
  };

  const queue = new taskcluster.Queue({
    rootUrl: rootUrl,
    credentials: {
      clientId: 'built-in-workers',
      accessToken: 'none',
    },
    fake: {
      task: async function (taskId) {
        const task = tasks[taskId];
        assert(task, `fake queue has no task ${taskId}`);
        return task;
      },
      claimWork: async function (taskQueueId, payload) {
        assert.equal(this._options.credentials.clientId, 'built-in-workers');
        const work = fakeQueue.claimableWork.pop();
        work.tasks.map(task => task.credentials = {
          clientId: 'task-creds',
          accessToken: 'none',
        });
        work.workerGroup = payload.workerGroup;
        work.workerId = payload.workerId;
        return work;
      },
      reportCompleted: async function (taskId, runId) {
        assert.equal(this._options.credentials.clientId, 'task-creds');
        fakeQueue.taskResolutions[taskId] = { completed: true };
        return {};
      },
      reportFailed: async function (taskId, runId) {
        assert.equal(this._options.credentials.clientId, 'task-creds');
        fakeQueue.taskResolutions[taskId] = { failed: true };
        return {};
      },
      reportException: async function (taskId, runId, payload) {
        assert.equal(this._options.credentials.clientId, 'task-creds');
        fakeQueue.taskResolutions[taskId] = { exception: payload };
        return {};
      },
    },
  });

  return queue;
};
