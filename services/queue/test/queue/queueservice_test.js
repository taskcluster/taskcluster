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
  var data          = require('../../queue/data');
  var util          = require('util');

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

  // Create a simple hack to fake creation of Task instances
  var MockTask = function(props) {_.assign(this, props)};
  util.inherits(MockTask , data.Task);

  var queueService = new QueueService({
    prefix:             cfg.get('queue:queuePrefix'),
    credentials:        cfg.get('azure'),
    signatureSecret:    "A very public secret",
    deadlineQueue:      cfg.get('queue:deadlineQueue'),
    deadlineDelay:      0, // bad idea to use this in production!!!
    pendingPollTimeout: 30 * 1000
  });

  // Dummy identifiers for use in this test
  var workerType    = 'no-worker';
  var provisionerId = 'no-provisioner';

  test("putDeadlineMessage, pollDeadlineQueue", async () => {
    var taskId = slugid.v4();
    var deadline = new Date(new Date().getTime() + 2 * 1000);
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
        return message.taskId === taskId;
      });
      assert(foundTaskId, "Expected to see taskId at some point");
    });
  });

  test("put, get, update, timeout, delete, validate signature", async () => {
    var taskId  = slugid.v4();
    var runId   = 0;
    var task    = new MockTask({
      taskId:             taskId,
      provisionerId:      provisionerId,
      workerType:         workerType,
      deadline:           new Date(new Date().getTime() + 5 * 60 * 1000)
    });

    // Put message into pending queue
    debug("### Putting message in pending queue");
    await queueService.putPendingMessage(task, runId);

    // Get signedPollUrl
    var {signedPollUrl} = await queueService.signedPendingPollUrl(
      provisionerId, workerType
    );

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
      assert(payload.taskId === taskId, "Got wrong taskId, try agian in 5 min");

      return [message, payload];
    }).catch(function() {
      throw new Error("Failed to poll queue");
    });

    // Validate signature
    var valid = queueService.validateSignature(task, runId, payload.signature);
    assert(valid, "Signature was invalid!");

    // Update message, to prove that we can
    debug("### Updating claimed message");
    var result = await queueService.updatePendingTaskMessage(
      task, runId + 1, 1000, message.MessageId, message.PopReceipt
    );
    debug("Message will be visible at: %s", result.takenUntil);
    assert(result.messageId === message.MessageId,
           "Expected the same messageId!");

    // Let the message expire, and then take it again
    debug("### Polling for queue for message (again)");
    var [message2, payload2] = await base.testing.poll(async () => {
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
      assert(payload.taskId === taskId, "Got wrong taskId, try agian in 5 min");

      return [message, payload];
    }, 10, 500).catch(function() {
      throw new Error("Failed to poll queue the 2nd time");
    });

    // Validate signature
    var valid = queueService.validateSignature(
      task, runId + 1,
      payload2.signature
    );
    assert(valid, "Signature on 2nd message was invalid!");

    // Delete message
    debug("### Delete pending message");
    return queueService.deletePendingTaskMessage(
      task,
      message2.MessageId,
      message2.PopReceipt
    );
  });
});
