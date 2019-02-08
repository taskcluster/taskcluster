const slugid = require('slugid');
const assert = require('assert');
const crypto = require('crypto');
const QueueService = require('../src/queueservice');
const _ = require('lodash');
const url = require('url');
const request = require('superagent');
const debug = require('debug')('test:queueservice');
const xml2js = require('xml2js');
const assume = require('assume');
const config = require('typed-env-config');
const Monitor = require('taskcluster-lib-monitor');
const testing = require('taskcluster-lib-testing');
const helper = require('./helper');

helper.secrets.mockSuite(__filename, ['azure'], function(mock, skipping) {
  let queueService;
  let monitor;

  suiteSetup(async () => {
    if (skipping()) {
      return;
    }

    const cfg = await helper.load('cfg');

    monitor = new Monitor({
      projectName: 'test',
      mock: true,
      patchGlobal: false,
    });

    if (mock) {
      queueService = new QueueService({
        prefix: cfg.app.queuePrefix2,
        credentials: {fake: true},
        claimQueue: cfg.app.claimQueue,
        resolvedQueue: cfg.app.resolvedQueue,
        deadlineQueue: cfg.app.deadlineQueue,
        pendingPollTimeout: 30 * 1000,
        deadlineDelay: 10,
        monitor,
      });
    } else {
      queueService = new QueueService({
        // use a unique set of queues for each run
        prefix: `t${crypto.randomBytes(3).toString('hex').slice(0, 5)}`,
        credentials: cfg.azure,
        claimQueue: cfg.app.claimQueue,
        resolvedQueue: cfg.app.resolvedQueue,
        deadlineQueue: cfg.app.deadlineQueue,
        pendingPollTimeout: 30 * 1000,
        deadlineDelay: 1000,
        monitor,
      });
    }
  });

  suiteTeardown(function() {
    if (skipping()) {
      return;
    }

    monitor.reset();

    if (queueService) {
      queueService.terminate();
    }
  });

  // Dummy identifiers for use in this test
  const workerType = 'no-worker';
  const provisionerId = slugid.v4(); // make a unique provisionerId

  test('putDeadlineMessage, pollDeadlineQueue', helper.runWithFakeTime(async () => {
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
    }, Infinity);
  }, mock));

  test('putClaimMessage, pollClaimQueue', helper.runWithFakeTime(async () => {
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
    }, Infinity);
  }, mock));

  test('putResolvedMessage, pollResolvedQueue', helper.runWithFakeTime(async () => {
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
    }, Infinity);
  }, mock));

  // not supported for mock QueueService
  test('put, poll, release, poll, delete (priority: lowest)', helper.runWithFakeTime(async () => {
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
    }, Infinity);

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
    }, Infinity);

    // Check message
    assert(message.taskId === taskId);
    assert(message.runId === runId);
    assert(message.hintId, 'missing hintId');

    // Remove message
    await message.remove();
  }, mock));

  test('countPendingMessages', async () => {
    const count = await queueService.countPendingMessages(
      provisionerId,
      workerType
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

  if (!mock) {
    // signed URLs are not supported for mock QueueService, so no need for these
    // tests in that case.
    test('put, get, delete (priority: high) (signed URLs)', async function() {
      const taskId = slugid.v4();
      const runId = 0;
      const task = {
        taskId: taskId,
        provisionerId: provisionerId,
        workerType: workerType,
        priority: 'high',
        deadline: new Date(new Date().getTime() + 5 * 60 * 1000),
      };

      // Put message into pending queue
      debug('### Putting message in pending queue');
      await queueService.putPendingMessage(task, runId);

      // Get signedPollUrl and signedDeleteUrl
      const {
        queues,
      } = await queueService.signedPendingPollUrls(provisionerId, workerType);

      // Get a message
      debug('### Polling for queue for message');
      let i = 0;
      let queue;
      const message = await testing.poll(async () => {
        // Poll azure queue
        debug(' - Polling azure queue: %s', i);
        queue = queues[i++ % queues.length];
        const res = await request.get(queue.signedPollUrl).buffer();
        assert(res.ok, 'Request failed');
        debug(' - poll succeeded');

        // Parse XML
        const json = await new Promise((accept, reject) => {
          xml2js.parseString(res.text, (err, json) => {
            err ? reject(err) : accept(json);
          });
        });
        debug(' - parse succeeded');

        // Get message
        assert(json.QueueMessagesList.QueueMessage, 'no messages in queue');
        return json.QueueMessagesList.QueueMessage[0];
      }, 20 * queues.length, 1000);

      // Load the payload
      let payload = Buffer.from(message.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);

      assert(payload.taskId === taskId, 'Got wrong taskId');
      assert(typeof payload.hintId === 'string', 'Missing hintId');

      debug('### Delete pending message');
      const deleteMessageUrl = queue.signedDeleteUrl
        .replace('{{messageId}}', encodeURIComponent(message.MessageId))
        .replace('{{popReceipt}}', encodeURIComponent(message.PopReceipt));
      const res = await request.del(deleteMessageUrl).buffer();
      assert(res.ok, 'Message failed to delete');
    });

    test('put, get, delete (priority: lowest) (signed URLs)', async function() {
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

      // Get signedPollUrl and signedDeleteUrl
      const {
        queues,
      } = await queueService.signedPendingPollUrls(provisionerId, workerType);

      // Get a message
      debug('### Polling for queue for message');
      let i = 0;
      let queue;
      const message = await testing.poll(async () => {
        // Poll azure queue
        debug(' - Polling azure queue: %s', i);
        queue = queues[i++ % queues.length];
        const res = await request.get(queue.signedPollUrl).buffer();
        assert(res.ok, 'Request failed');
        debug(' - poll succeeded');

        // Parse XML
        const json = await new Promise((accept, reject) => {
          xml2js.parseString(res.text, (err, json) => {
            err ? reject(err) : accept(json);
          });
        });
        debug(' - parse succeeded');

        // Get message (will if fail if there is no message)
        return json.QueueMessagesList.QueueMessage[0];
      }, 20 * queues.length);

      // Load the payload
      let payload = Buffer.from(message.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);
      debug('Received message with payload: %j', payload);

      // Check that we got the right task, notice they have life time of 5 min,
      // so waiting 5 min should fix this issue.. Another option is to create
      // a unique queue for each test run. Probably not needed.
      assert(payload.taskId === taskId, 'Got wrong taskId, try again in 5 min');
      assert(payload.hintId, 'missing hintId');

      debug('### Delete pending message');
      const deleteMessageUrl = queue.signedDeleteUrl
        .replace('{{messageId}}', encodeURIComponent(message.MessageId))
        .replace('{{popReceipt}}', encodeURIComponent(message.PopReceipt));
      const res = await request.del(deleteMessageUrl).buffer();
      assert(res.ok, 'Message failed to delete');
    });
  }

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
