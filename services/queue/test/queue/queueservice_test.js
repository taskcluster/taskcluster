suite('queue/QueueService', function() {
  var Promise       = require('promise');
  var slugid        = require('slugid');
  var assert        = require('assert');
  var QueueService  = require('../../queue/queueservice');
  var base          = require('taskcluster-base');
  var _             = require('lodash');
  var url           = require('url');
  var request       = require('superagent-promise');
  var debug         = require('debug')('queue:test:queueservice');
  var xml2js        = require('xml2js');
  var assume        = require('assume');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + 'test'),
    envs: [
      'azure_accountName',
      'azure_accountKey',
    ],
    filename:     'taskcluster-queue'
  });

  // Check that we have an account
  if (!cfg.get('azure:accountKey')) {
    console.log("\nWARNING:");
    console.log("Skipping 'blobstore' tests, missing config file: " +
                "taskcluster-queue.conf.json");
    return;
  }

  var queueService = new QueueService({
    // Using a different prefix as we create/delete a lot of queues and we don't
    // want queues in state being-deleted when running the other tests
    prefix:             cfg.get('queue:queuePrefix2'),
    credentials:        cfg.get('azure'),
    claimQueue:         cfg.get('queue:claimQueue'),
    deadlineQueue:      cfg.get('queue:deadlineQueue'),
    pendingPollTimeout: 30 * 1000,
    deadlineDelay:      1000
  });

  // Dummy identifiers for use in this test
  var workerType    = 'no-worker';
  var provisionerId = slugid.v4(); // make a unique provisionerId

  test("putDeadlineMessage, pollDeadlineQueue", async () => {
    var taskId      = slugid.v4();
    var deadline    = new Date(new Date().getTime() + 2 * 1000);
    debug("Putting message with taskId: %s", taskId);
    // Put message
    await queueService.putDeadlineMessage(taskId, deadline);

    // Poll for message
    return base.testing.poll(async () => {
      var messages = await queueService.pollDeadlineQueue();
      debug("Received messages: %j", messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      var foundTaskId = messages.some((message) => {
        return message.taskId === taskId &&
               message.deadline.getTime() === deadline.getTime();
      });
      assert(foundTaskId, "Expected to see taskId at some point");
    });
  });

  test("putClaimMessage, pollClaimQueue", async () => {
    var taskId      = slugid.v4();
    var takenUntil  = new Date(new Date().getTime() + 2 * 1000);
    debug("Putting message with taskId: %s", taskId);
    // Put message
    await queueService.putClaimMessage(taskId, 0, takenUntil);

    // Poll for message
    return base.testing.poll(async () => {
      var messages = await queueService.pollClaimQueue();
      debug("Received messages: %j", messages);

      // delete all the messages
      await Promise.all(messages.map((message) => {
        return message.remove();
      }));

      // Check if we got the message
      var foundTaskId = messages.some((message) => {
        return message.taskId === taskId &&
               message.takenUntil.getTime() === takenUntil.getTime();
      });
      assert(foundTaskId, "Expected to see taskId at some point");
    });
  });

  test("put, get, delete", async () => {
    var taskId  = slugid.v4();
    var runId   = 0;
    var task    = {
      taskId:             taskId,
      provisionerId:      provisionerId,
      workerType:         workerType,
      deadline:           new Date(new Date().getTime() + 5 * 60 * 1000)
    };

    // Put message into pending queue
    debug("### Putting message in pending queue");
    await queueService.putPendingMessage(task, runId);

    // Get signedPollUrl and signedDeleteUrl
    var {
      queues: [
        {
          signedPollUrl,
          signedDeleteUrl
        }
      ]
    } = await queueService.signedPendingPollUrls(provisionerId, workerType);

    // Get a message
    debug("### Polling for queue for message");
    var [message, payload] = await base.testing.poll(async () => {
      // Poll azure queue
      debug(" - polling");
      var res = await request.get(signedPollUrl).buffer().end();
      assert(res.ok, "Request failed");

      // Parse XML
      var json = await new Promise((accept, reject) => {
        xml2js.parseString(res.text, (err, json) => {
          err ? reject(err) : accept(json)
        });
      });

      // Get message (will if fail if there is no message)
      var message = json.QueueMessagesList.QueueMessage[0];

      // Load the payload
      var payload = new Buffer(message.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);
      debug("Received message with payload: %j", payload);

      // Check that we got the right task, notice they have life time of 5 min,
      // so waiting 5 min should fix this issue.. Another option is to create
      // a unique queue for each test run. Probably not needed.
      assert(payload.taskId === taskId, "Got wrong taskId, try again in 5 min");

      return [message, payload];
    }).catch(function() {
      throw new Error("Failed to poll queue");
    });

    debug("### Delete pending message");
    var deleteMessageUrl = signedDeleteUrl
                            .replace('{{messageId}}', message.MessageId)
                            .replace('{{popReceipt}}', message.PopReceipt);
    var res = await request.del(deleteMessageUrl).buffer().end();
    assert(res.ok, "Message failed to delete");
  });


  test("countPendingMessages", async () => {
    var count = await queueService.countPendingMessages(
      provisionerId,
      workerType
    );
    debug("pending message count: %j", count);
    assert(typeof(count) === 'number', "Expected count as number!");
  });

  test("deleteUnusedWorkerQueues (can delete queues)", async () => {
    // 11 days into the future, so we'll delete all queues (yay)
    let now = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);

    // Ensure a queue with updated meta-data exists
    let provisionerId = slugid.v4();
    let workerType = slugid.v4();
    let queueName = await queueService.ensurePendingQueue(
      provisionerId, workerType
    );

    // Delete previously created queues
    let deleted = await queueService.deleteUnusedWorkerQueues(now);
    assume(deleted).is.atleast(1);

    try {
      // Get meta-data, this will fail if the queue was deleted
      await queueService.client.getMetadata(queueName);
      assert(false);
    } catch (err) {
      assert(err.statusCode === 404, "Expected 400 error");
    }
  });


  test("deleteUnusedWorkerQueues (respects meta-data)", async () => {
    // Ensure a queue with updated meta-data exists
    let provisionerId = slugid.v4();
    let workerType = slugid.v4();
    let queueName = await queueService.ensurePendingQueue(
      provisionerId, workerType
    );

    // Let's delete from now and check that we didn't delete queue just created
    await queueService.deleteUnusedWorkerQueues();

    // Get meta-data, this will fail if the queue was deleted
    await queueService.client.getMetadata(queueName);
  });
});
