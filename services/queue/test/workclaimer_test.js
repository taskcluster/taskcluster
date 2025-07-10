import assume from 'assume';
import slugid from 'slugid';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';
import taskcluster from 'taskcluster-client';
import WorkClaimer from '../src/workclaimer.js';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function (mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskDef = () => ({
    taskGroupId: slugid.v4(),
    taskQueueId: 'taskQueue/id',
    schedulerId: 'dummy-scheduler',
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('1 days'),
    expires: taskcluster.fromNowJSON('2 days'),
    payload: {},
    tags: { tag: 'value' },
    metadata: {
      name: 'Unit testing task',
      description: 'Task created during unit tests',
      owner: 'yarik@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
  });

  test('getHintPoller', () => {
    const fakeClaimer = new WorkClaimer({
      db: {},
      monitor: {},
      publisher: {},
      queueService: {},
      claimTimeout: 1000,
      credentials: {},
    });
    assume(Object.keys(fakeClaimer._hintPollers).length).equals(0);

    let poller = fakeClaimer.getHintPoller('taskQueue/queue1');
    assume(Object.keys(fakeClaimer._hintPollers).length).equals(1);

    fakeClaimer.getHintPoller('taskQueue/queue2');
    assume(Object.keys(fakeClaimer._hintPollers).length).equals(2);

    // get poller for same queue
    poller = fakeClaimer.getHintPoller('taskQueue/queue1');
    assume(Object.keys(fakeClaimer._hintPollers).length).equals(2);

    // destroy poller
    poller.destroy();
    process.nextTick(() => {
      // should be removed from cache
      assume(Object.keys(fakeClaimer._hintPollers).length).equals(1);
    });
  });

  test('claims something', async () => {
    const taskId = slugid.v4();
    const monitor = await helper.load('monitor');
    const publisher = await helper.load('publisher');
    const db = await helper.load('db');
    const cfg = await helper.load('cfg');

    const workClaimer = new WorkClaimer({
      db,
      monitor,
      publisher,
      queueService: {
        pollPendingQueue: (taskQueueId) => () => [{
          taskId,
          runId: 0,
          hintId: 'hint1',
          release: async () => { },
          remove: async () => { },
        }],
        putClaimMessage: () => { },
      },
      claimTimeout: 1000,
      credentials: cfg.taskcluster.credentials,
    });

    await helper.queue.createTask(taskId, taskDef(taskId));
    await helper.queue.scheduleTask(taskId);

    const aborted = new Promise(resolve => setTimeout(resolve, 1000));
    const claims = await workClaimer.claim('taskQueue/Id', 'workerGroup', 'workerId', 1, aborted);
    assume(claims.length).equal(1);
    assume(claims[0].status.taskId).equal(taskId);
    helper.assertPulseMessage('task-running', m => m.payload.task?.tags?.tag === 'value');
  });

  test('hint poller errors are recovered', async () => {
    const taskId = slugid.v4();
    const monitor = await helper.load('monitor');
    const publisher = await helper.load('publisher');
    const db = await helper.load('db');
    const cfg = await helper.load('cfg');

    let calls = 0;

    const workClaimer = new WorkClaimer({
      db,
      monitor,
      publisher,
      queueService: {
        pollPendingQueue: (taskQueueId) => () => {
          calls++;
          if (calls < 3) {
            throw new Error('error');
          }
          return [];
        },
        putClaimMessage: () => { },
      },
      claimTimeout: 1000,
      credentials: cfg.taskcluster.credentials,
    });

    await helper.queue.createTask(taskId, taskDef(taskId));
    await helper.queue.scheduleTask(taskId);

    const tryCall = async () => {
      try {
        return await workClaimer.claim('taskQueue/Id', 'workerGroup', 'workerId', 3, new Promise(resolve => setTimeout(resolve, 1000)));
      } catch (err) {
        return 0;
      }
    };

    await tryCall();
    await tryCall();
    await tryCall();

    const res = await tryCall();
    assume(res).deep.equal([]);
  });
});
