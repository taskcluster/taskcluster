suite('queue/QueueService', function() {
  var Promise       = require('promise');
  var slugid        = require('slugid');
  var assert        = require('assert');
  var QueueService  = require('../lib/queueservice');
  var _             = require('lodash');
  var url           = require('url');
  var request       = require('superagent-promise');
  var debug         = require('debug')('test:queueservice');
  var xml2js        = require('xml2js');
  var assume        = require('assume');
  var config        = require('typed-env-config');
  var Monitor       = require('taskcluster-lib-monitor');
  var testing       = require('taskcluster-lib-testing');

  // Load configuration
  var cfg = config({profile: 'test'});

  // Check that we have an account
  let queueService = null;
  let monitor = null;
  if (cfg.azure && cfg.azure.accountKey) {
    before(async () => {
      monitor = await Monitor({
        credentials: {},
        project: 'test',
        mock: true,
        patchGlobal: false,
      });
      queueService = new QueueService({
        // Using a different prefix as we create/delete a lot of queues and we
        // don't want queues in state being-deleted when running the other tests
        prefix:             cfg.app.queuePrefix2,
        credentials:        cfg.azure,
        claimQueue:         cfg.app.claimQueue,
        resolvedQueue:      cfg.app.resolvedQueue,
        deadlineQueue:      cfg.app.deadlineQueue,
        pendingPollTimeout: 30 * 1000,
        deadlineDelay:      1000,
        monitor,
      });
    });
  } else {
    console.log('WARNING: Skipping \'blobstore\' tests, missing user-config.yml');
    this.pending = true;
  }

  // Dummy identifiers for use in this test
  var workerType    = 'no-worker';
  var provisionerId = slugid.v4(); // make a unique provisionerId

  test('putDeadlineMessage, pollDeadlineQueue', async () => {
    var taskId      = slugid.v4();
    var taskGroupId = slugid.v4();
    var schedulerId = slugid.v4();
    var deadline    = new Date(new Date().getTime() + 2 * 1000);
    debug('Putting message with taskId: %s, taskGroupId: %s', taskId, taskGroupId);
    // Put message
    await queueService.putDeadlineMessage(taskId, taskGroupId, schedulerId, deadline);

    // Poll for message
    return testing.poll(async () => {
      var messages = await queueService.pollDeadlineQueue();
      debug('Received messages: %j', messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      var foundTaskId = messages.some((message) => {
        return message.taskId === taskId && message.taskGroupId === taskGroupId &&
               message.schedulerId === schedulerId && message.deadline.getTime() === deadline.getTime();
      });
      assert(foundTaskId, 'Expected to see taskId at some point');
    });
  });

  test('putClaimMessage, pollClaimQueue', async () => {
    var taskId      = slugid.v4();
    var takenUntil  = new Date(new Date().getTime() + 2 * 1000);
    debug('Putting message with taskId: %s', taskId);
    // Put message
    await queueService.putClaimMessage(taskId, 0, takenUntil);

    // Poll for message
    return testing.poll(async () => {
      var messages = await queueService.pollClaimQueue();
      debug('Received messages: %j', messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      var foundTaskId = messages.some((message) => {
        return message.taskId === taskId &&
               message.takenUntil.getTime() === takenUntil.getTime();
      });
      assert(foundTaskId, 'Expected to see taskId at some point');
    });
  });

  test('putResolvedMessage, pollResolvedQueue', async () => {
    var taskId      = slugid.v4();
    var taskGroupId = slugid.v4();
    var schedulerId = slugid.v4();
    debug('Putting message with taskId: %s, taskGroupId: %s', taskId, taskGroupId);
    // Put message
    await queueService.putResolvedMessage(taskId, taskGroupId, schedulerId, 'completed');

    // Poll for message
    return testing.poll(async () => {
      var messages = await queueService.pollResolvedQueue();
      debug('Received messages: %j', messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      var foundTaskId = messages.some((message) => {
        return message.taskId === taskId && message.taskGroupId === taskGroupId &&
               message.schedulerId === schedulerId && message.resolution === 'completed';
      });
      assert(foundTaskId, 'Expected to see taskId at some point');
    });
  });

  test('put, get, delete (priority: normal)', async () => {
    var taskId  = slugid.v4();
    var runId   = 0;
    var task    = {
      taskId:             taskId,
      provisionerId:      provisionerId,
      workerType:         workerType,
      priority:           'normal',
      deadline:           new Date(new Date().getTime() + 5 * 60 * 1000),
    };

    // Put message into pending queue
    debug('### Putting message in pending queue');
    await queueService.putPendingMessage(task, runId);

    // Get signedPollUrl and signedDeleteUrl
    var {
      queues,
    } = await queueService.signedPendingPollUrls(provisionerId, workerType);

    // Get a message
    debug('### Polling for queue for message');
    var i = 0;
    var queue;
    var [message, payload] = await testing.poll(async () => {
      // Poll azure queue
      debug(' - Polling azure queue: %s', i);
      queue = queues[i++ % queues.length];
      var res = await request.get(queue.signedPollUrl).buffer().end();
      assert(res.ok, 'Request failed');

      // Parse XML
      var json = await new Promise((accept, reject) => {
        xml2js.parseString(res.text, (err, json) => {
          err ? reject(err) : accept(json);
        });
      });

      // Get message (will if fail if there is no message)
      var message = json.QueueMessagesList.QueueMessage[0];

      // Load the payload
      var payload = new Buffer(message.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);
      debug('Received message with payload: %j', payload);

      // Check that we got the right task, notice they have life time of 5 min,
      // so waiting 5 min should fix this issue.. Another option is to create
      // a unique queue for each test run. Probably not needed.
      assert(payload.taskId === taskId, 'Got wrong taskId, try again in 5 min');

      return [message, payload];
    }).catch(err => {throw new Error('Failed to poll queue');});
    assert(payload.hintId, 'missing hintId');

    debug('### Delete pending message');
    var deleteMessageUrl = queue.signedDeleteUrl
          .replace('{{messageId}}', encodeURIComponent(message.MessageId))
          .replace('{{popReceipt}}', encodeURIComponent(message.PopReceipt));
    var res = await request.del(deleteMessageUrl).buffer().end();
    assert(res.ok, 'Message failed to delete');
  });

  test('put, poll, release, poll, delete (priority: normal)', async () => {
    var taskId  = slugid.v4();
    var runId   = 0;
    var task    = {
      taskId:             taskId,
      provisionerId:      provisionerId,
      workerType:         workerType,
      priority:           'normal',
      deadline:           new Date(new Date().getTime() + 5 * 60 * 1000),
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
    });

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
    });

    // Check message
    assert(message.taskId === taskId);
    assert(message.runId === runId);
    assert(message.hintId, 'missing hintId');

    // Remove message
    await message.remove();
  });

  test('put, get, delete (priority: high)', async () => {
    var taskId  = slugid.v4();
    var runId   = 0;
    var task    = {
      taskId:             taskId,
      provisionerId:      provisionerId,
      workerType:         workerType,
      priority:           'high',
      deadline:           new Date(new Date().getTime() + 5 * 60 * 1000),
    };

    // Put message into pending queue
    debug('### Putting message in pending queue');
    await queueService.putPendingMessage(task, runId);

    // Get signedPollUrl and signedDeleteUrl
    var {
      queues,
    } = await queueService.signedPendingPollUrls(provisionerId, workerType);

    // Get a message
    debug('### Polling for queue for message');
    var i = 0;
    var queue;
    var [message, payload] = await testing.poll(async () => {
      // Poll azure queue
      debug(' - Polling azure queue: %s', i);
      queue = queues[i++ % queues.length];
      var res = await request.get(queue.signedPollUrl).buffer().end();
      assert(res.ok, 'Request failed');

      // Parse XML
      var json = await new Promise((accept, reject) => {
        xml2js.parseString(res.text, (err, json) => {
          err ? reject(err) : accept(json);
        });
      });

      // Get message (will if fail if there is no message)
      var message = json.QueueMessagesList.QueueMessage[0];

      // Load the payload
      var payload = new Buffer(message.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);
      debug('Received message with payload: %j', payload);

      // Check that we got the right task, notice they have life time of 5 min,
      // so waiting 5 min should fix this issue.. Another option is to create
      // a unique queue for each test run. Probably not needed.
      assert(payload.taskId === taskId, 'Got wrong taskId, try again in 5 min');

      return [message, payload];
    }).catch(err => {throw new Error('Failed to poll queue');});
    assert(typeof payload.hintId === 'string', 'Missing hintId');

    debug('### Delete pending message');
    var deleteMessageUrl = queue.signedDeleteUrl
          .replace('{{messageId}}', encodeURIComponent(message.MessageId))
          .replace('{{popReceipt}}', encodeURIComponent(message.PopReceipt));
    var res = await request.del(deleteMessageUrl).buffer().end();
    assert(res.ok, 'Message failed to delete');
  });

  test('countPendingMessages', async () => {
    var count = await queueService.countPendingMessages(
      provisionerId,
      workerType
    );
    debug('pending message count: %j', count);
    assert(typeof count === 'number', 'Expected count as number!');
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
});
