const slugid = require('slugid');
const assert = require('assert');
const crypto = require('crypto');
const QueueService = require('../src/queueservice');
const _ = require('lodash');
const debug = require('debug')('test:queueservice');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');
const helper = require('./helper');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  let queueService;

  suiteSetup(async () => {
    if (skipping()) {
      return;
    }

    const cfg = await helper.load('cfg');

    if (mock) {
      queueService = new QueueService({
        prefix: cfg.app.queuePrefix2,
        credentials: {fake: true},
        claimQueue: cfg.app.claimQueue,
        resolvedQueue: cfg.app.resolvedQueue,
        deadlineQueue: cfg.app.deadlineQueue,
        deadlineDelay: 10,
        monitor: await helper.load('monitor'),
      });
    } else {
      queueService = new QueueService({
        // use a unique set of queues for each run
        prefix: `t${crypto.randomBytes(3).toString('hex').slice(0, 5)}`,
        credentials: cfg.azure,
        claimQueue: cfg.app.claimQueue,
        resolvedQueue: cfg.app.resolvedQueue,
        deadlineQueue: cfg.app.deadlineQueue,
        deadlineDelay: 1000,
        monitor: await helper.load('monitor'),
      });
    }
  });

  suiteTeardown(function() {
    if (skipping()) {
      return;
    }

    if (queueService) {
      queueService.terminate();
    }
  });

  // Dummy identifiers for use in this test
  const workerType = 'no-worker';
  const provisionerId = slugid.v4(); // make a unique provisionerId

  test('putDeadlineMessage, pollDeadlineQueue', testing.runWithFakeTime(async () => {
    const taskId = slugid.v4();
    const taskGroupId = slugid.v4();
    const schedulerId = slugid.v4();
    const deadline = new Date(new Date().getTime() + 1 * 1000);
    debug('Putting message with taskId: %s, taskGroupId: %s', taskId, taskGroupId);
    // Put message
    await queueService.putDeadlineMessage(taskId, taskGroupId, schedulerId, deadline);

    // Poll for message
    return testing.poll(async () => {
      const messages = await queueService.pollDeadlineQueue();
      debug('Received messages: %j', messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      const foundTaskId = messages.some((message) => {
        return message.taskId === taskId && message.taskGroupId === taskGroupId &&
               message.schedulerId === schedulerId && message.deadline.getTime() === deadline.getTime();
      });
      assert(foundTaskId, 'Expected to see taskId at some point');
    }, 100, 250);
  }, {mock}));

  test('putClaimMessage, pollClaimQueue', testing.runWithFakeTime(async () => {
    const taskId = slugid.v4();
    const takenUntil = new Date(new Date().getTime() + 2 * 1000);
    debug('Putting message with taskId: %s', taskId);
    // Put message
    await queueService.putClaimMessage(taskId, 0, takenUntil);

    // Poll for message
    return testing.poll(async () => {
      const messages = await queueService.pollClaimQueue();
      debug('Received messages: %j', messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      const foundTaskId = messages.some((message) => {
        return message.taskId === taskId &&
               message.takenUntil.getTime() === takenUntil.getTime();
      });
      assert(foundTaskId, 'Expected to see taskId at some point');
    }, 100, 250);
  }, {mock}));

  test('putResolvedMessage, pollResolvedQueue', testing.runWithFakeTime(async () => {
    const taskId = slugid.v4();
    const taskGroupId = slugid.v4();
    const schedulerId = slugid.v4();
    debug('Putting message with taskId: %s, taskGroupId: %s', taskId, taskGroupId);
    // Put message
    await queueService.putResolvedMessage(taskId, taskGroupId, schedulerId, 'completed');

    // Poll for message
    return testing.poll(async () => {
      const messages = await queueService.pollResolvedQueue();
      debug('Received messages: %j', messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      const foundTaskId = messages.some((message) => {
        return message.taskId === taskId && message.taskGroupId === taskGroupId &&
               message.schedulerId === schedulerId && message.resolution === 'completed';
      });
      assert(foundTaskId, 'Expected to see taskId at some point');
    }, 100, 250);
  }, {mock}));

  // not supported for mock QueueService
  test('put, poll, release, poll, delete (priority: lowest)', testing.runWithFakeTime(async () => {
    const taskId = slugid.v4();
    const runId = 0;
    const task = {
      taskId: taskId,
      provisionerId: provisionerId,
      workerType: workerType,
      priority: 'lowest',
      deadline: new Date(new Date().getTime() + 5 * 60 * 1000),
    };

    // Put message into pending queue
    debug('### Putting message in pending queue');
    await queueService.putPendingMessage(task, runId);

    // Get poll functions for queues
    let poll = await queueService.pendingQueues(provisionerId, workerType);

    // Poll for the message
    let message = await testing.poll(async () => {
      for (let i = 0; i < poll.length; i++) {
        let messages = await poll[i](1);
        if (messages.length === 1) {
          return messages[0];
        }
      }
      throw new Error('Expected message');
    }, 100, 250);

    // Check message
    assert(message.taskId === taskId);
    assert(message.runId === runId);

    // Release the message back into the queue
    await message.release();

    // Poll message again
    message = await testing.poll(async () => {
      for (let i = 0; i < poll.length; i++) {
        let messages = await poll[i](1);
        if (messages.length === 1) {
          return messages[0];
        }
      }
      throw new Error('Expected message to return');
    }, 100, 250);

    // Check message
    assert(message.taskId === taskId);
    assert(message.runId === runId);
    assert(message.hintId, 'missing hintId');

    // Remove message
    await message.remove();
  }, {mock}));

  test('countPendingMessages', async () => {
    const count = await queueService.countPendingMessages(
      provisionerId,
      workerType,
    );
    debug('pending message count: %j', count);
    assert(typeof count === 'number', 'Expected count as number!');
  });

  test('deleteUnusedWorkerQueues (respects meta-data)', async () => {
    // Ensure a queue with updated meta-data exists
    let provisionerId = slugid.v4();
    let workerType = slugid.v4();
    let queueNames = await queueService.ensurePendingQueue(
      provisionerId, workerType,
    );

    // Let's delete from now and check that we didn't delete queue just created
    await queueService.deleteUnusedWorkerQueues();

    // Get meta-data, this will fail if the queue was deleted
    await Promise.all(_.map(queueNames, queueName => {
      return queueService.client.getMetadata(queueName);
    }));
  });

  test('deleteUnusedWorkerQueues (can delete queues)', async () => {
    // 11 days into the future, so we'll delete all queues (yay)
    let now = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);

    // Ensure a queue with updated meta-data exists
    let provisionerId = slugid.v4();
    let workerType = slugid.v4();
    let queueNames = await queueService.ensurePendingQueue(
      provisionerId, workerType,
    );

    // Delete previously created queues
    let deleted = await queueService.deleteUnusedWorkerQueues(now);
    assume(deleted).is.atleast(1);

    await Promise.all(_.map(queueNames, async (queueName) => {
      try {
        // Get meta-data, this will fail if the queue was deleted
        await queueService.client.getMetadata(queueName);
        assert(false, 'Expected the queue to have been deleted!');
      } catch (err) {
        assert(err.statusCode === 404, 'Expected 400 error');
      }
    }));
  });
  // NOTE: deleteUnusedWorkerQueues must be tested last, as Azure does not handle
  // deletion immediately and it may otherwise "bleed over" into other tests
});
