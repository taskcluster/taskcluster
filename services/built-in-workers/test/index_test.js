import * as helper from './helper.js';
import slugid from 'slugid';
import * as testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  const fakeQueue = helper.withFakeQueue();

  test('check succeed worker', async function() {
    const tq = await helper.load('succeedTaskQueue');
    const taskId = slugid.nice();
    fakeQueue.claimableWork.push({
      tasks: [
        {
          status: {
            taskId: taskId,
          },
          runId: 0,
          task: {
            taskQueueId: 'built-in/succeed',
            payload: {},
          },
        },
      ],
    });
    await tq.claimTask();
    fakeQueue.assertTaskResolved(taskId, { completed: true });
  });

  test('Check Fail worker', async function() {
    const tq = await helper.load('failTaskQueue');
    const taskId = slugid.nice();
    fakeQueue.claimableWork.push({
      tasks: [
        {
          status: {
            taskId: taskId,
          },
          runId: 0,
          task: {
            taskQueueId: 'built-in/fail',
            payload: {},
          },
        },
      ],
    });
    await tq.claimTask();
    fakeQueue.assertTaskResolved(taskId, { failed: true });
  });

  test('Check non empty payloadd for succeed', async function() {
    const tq = await helper.load('succeedTaskQueue');
    const taskId = slugid.nice();
    fakeQueue.claimableWork.push({
      tasks: [
        {
          status: {
            taskId: taskId,
          },
          runId: 0,
          task: {
            provisionerId: 'built-in',
            workerType: 'succeed',
            payload: {
              task: 'put',
            },
          },
        },
      ],
    });
    await tq.claimTask();
    const expectedPayload = {
      reason: 'malformed-payload',
    };
    fakeQueue.assertTaskResolved(taskId, { exception: expectedPayload });
  });

  test('Check non empty payload for fail', async function() {
    const tq = await helper.load('failTaskQueue');
    const taskId = slugid.nice();
    fakeQueue.claimableWork.push({
      tasks: [
        {
          status: {
            taskId: taskId,
          },
          runId: 0,
          task: {
            provisionerId: 'built-in',
            workerType: 'fail',
            payload: {
              task: 'put',
            },
          },
        },
      ],
    });
    const expectedPayload = {
      reason: 'malformed-payload',
    };
    await tq.claimTask();
    fakeQueue.assertTaskResolved(taskId, { exception: expectedPayload });
  });
});
