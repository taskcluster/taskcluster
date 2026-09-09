import helper from './helper.js';
import slugid from 'slugid';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  helper.withFakeQueue();

  test('check succeed worker', async () => {
    const tq = await helper.load('succeedTaskQueue');
    const taskId = slugid.nice();
    helper.claimableWork.push({
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
    helper.assertTaskResolved(taskId, { completed: true });
  });

  test('Check Fail worker', async () => {
    const tq = await helper.load('failTaskQueue');
    const taskId = slugid.nice();
    helper.claimableWork.push({
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
    helper.assertTaskResolved(taskId, { failed: true });
  });

  test('Check non empty payloadd for succeed', async () => {
    const tq = await helper.load('succeedTaskQueue');
    const taskId = slugid.nice();
    helper.claimableWork.push({
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
    helper.assertTaskResolved(taskId, { exception: expectedPayload });
  });

  test('Check non empty payload for fail', async () => {
    const tq = await helper.load('failTaskQueue');
    const taskId = slugid.nice();
    helper.claimableWork.push({
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
    helper.assertTaskResolved(taskId, { exception: expectedPayload });
  });
});
