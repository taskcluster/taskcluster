const debug = require('debug')('test:query');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  const makeProvisioner = async (opts) => {
    const provisioner = Object.assign({
      provisionerId: 'prov1-extended-extended-extended',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
      actions: [],
    }, opts);
    await helper.Provisioner.create(provisioner);
    return provisioner;
  };

  test('pendingTasks >= 1', async () => {
    const taskDef = {
      provisionerId: 'no-provisioner-extended-extended',
      workerType: 'query-test-worker-extended-extended',
      schedulerId: 'my-scheduler',
      taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
      routes: [],
      retries: 5,
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('2 minutes'),
      scopes: [],
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
      tags: {
        purpose: 'taskcluster-testing',
      },
    };

    const taskId1 = slugid.v4();
    const taskId2 = slugid.v4();

    debug('### Create tasks');
    await Promise.all([
      helper.queue.createTask(taskId1, taskDef),
      helper.queue.createTask(taskId2, taskDef),
    ]);

    const r1 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended',
      'query-test-worker-extended-extended',
    );
    assume(r1.pendingTasks).is.greaterThan(1);

    // Result is cached for 20 seconds, so adding one more and checking should
    // give the same result, as we're not waiting for the timeout
    await helper.queue.createTask(taskId1, taskDef);

    // Note: There is some timing here, but since the queue.pendingTasks result
    // is cached it ought to be really fast and take less than 20 seconds to
    // do: queue.createTask + queue.pendingTasks, if not that's also sort of a
    // bug we should investigate
    const r2 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended',
      'query-test-worker-extended-extended',
    );
    assume(r2.pendingTasks).is.equals(r1.pendingTasks);

    // WARNING: The test below this point is not fast and certainly not robust
    // enough to run all the time. But it can be easily activated if messing
    // with queueservice.js and you want to ensure that it still works.
    // Just comment out the return statement below.
    return; // STOP TEST HERE
    console.log('WARNING: Unstable test running, should be disabled on master');
    await testing.poll(async () => {
      // At some point in the future we have to got fetch a new result saying
      // more tasks are now in the queue...
      const r3 = await helper.queue.pendingTasks(
        'no-provisioner-extended-extended',
        'query-test-worker-extended-extended',
      );
      assume(r3.pendingTasks).is.greaterThan(r1.pendingTasks);
    }, 30, 1000);
  });

  test('pendingTasks == 0', async () => {
    const r1 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended',
      'empty-test-worker-extended-extended',
    );
    assume(r1.pendingTasks).equals(0);

    const r2 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended',
      'empty-test-worker-extended-extended',
    );
    assume(r2.pendingTasks).equals(0);
  });

  // aje
  //
  // process:
  //   - add task
  //   - check that initial value is empty as expected
  //   - claim task
  //   - verify that last_consumed value is expected
  test('lastClaimed >= 1', async () => {
    const provisionerId = 'no-provisioner';
    const workerType = 'gecko-b-1-android';
    const workerGroup = 'my-worker-group-extended-extended';
    const workerId = 'my-worker-extended-extended';
    await makeProvisioner({provisionerId});

    let taskIds = [];

    for (let i = 0; i < 4; i++) {
      const taskId = slugid.v4();
      taskIds.push(taskId);

      const taskStatus = await helper.queue.createTask(taskIds[i], {
        provisionerId,
        workerType,
        priority: 'normal',
        created: taskcluster.fromNowJSON(),
        deadline: taskcluster.fromNowJSON('30 min'),
        payload: {},
        metadata: {
          name: 'Unit testing task',
          description: 'Task created during unit tests',
          owner: 'haali@mozilla.com',
          source: 'https://github.com/taskcluster/taskcluster-queue',
        },
      });
    }

    // let claimed = 0;
    // let retries = 30;
    // while (claimed < 4) {
    //   if (!retries--) {
    //     throw new Error('Could not claim all 4 tasks after multiple attempts');
    //   }
    //   const res = await helper.queue.claimWork(provisionerId, workerType, {
    //     workerGroup,
    //     workerId,
    //     tasks: 4,
    //   });
    //   claimed += res.tasks.length;
    // }
    await helper.queue.claimWork(provisionerId, workerType, {
      workerGroup,
      workerId,
      tasks: 1,
    });

    const r4 = await helper.queue.lastClaimed(
      'no-provisioner-extended-extended',
      'query-test-worker-extended-extended',
    );
    assume(r4.lastClaimed).is.not.equal(0);

    // const result = await helper.queue.getWorker(provisionerId, workerType, workerGroup, workerId);
    // const recentTasks = result.recentTasks;

    // assert.equal(result.recentTasks.length, 20, 'expected to have 20 tasks');

    // for (let i =0; i < 20; i++) {
    //   assert(recentTasks[i].taskId === taskIds[i + 10], `expected taskId ${taskIds[i + 10]}`);
    // }






    return;
    // the old test

    const taskDef = {
      provisionerId: 'no-provisioner-extended-extended',
      workerType: 'query-test-worker-extended-extended',
      schedulerId: 'my-scheduler',
      taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
      routes: [],
      retries: 5,
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('2 minutes'),
      scopes: [],
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
      tags: {
        purpose: 'taskcluster-testing',
      },
    };

    const taskId1 = slugid.v4();
    const taskId2 = slugid.v4();

    debug('### Create tasks');
    await Promise.all([
      helper.queue.createTask(taskId1, taskDef),
      helper.queue.createTask(taskId2, taskDef),
    ]);

    const r1 = await helper.queue.lastClaimed(
      'no-provisioner-extended-extended',
      'query-test-worker-extended-extended',
    );
    assume(r1.lastClaimed).is.equal(0);

    // claim a job
    await helper.queue.claimTask(taskId1, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    const r2 = await helper.queue.lastClaimed(
      'no-provisioner-extended-extended',
      'query-test-worker-extended-extended',
    );
    assume(r2.lastClaimed).is.not.equal(0);
    // TODO: add a more difficult test (verify it's a unix epoch or...?)
    // 1551842772
  });
});
