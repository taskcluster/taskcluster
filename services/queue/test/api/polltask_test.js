suite('Poll tasks', function() {
  var debug       = require('debug')('test:api:create');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper')();
  var request     = require('superagent-promise');
  var xml2js      = require('xml2js');

  test("createTask, pollTaskUrl, getMessage, claimWork", function() {
    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setMinutes(new Date().getMinutes() + 3);

    // Use the same task definition for everything
    var taskDef = {
      provisionerId:    'my-provisioner',
      workerType:       'az-queue-test',
      schedulerId:      'my-scheduler',
      taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
      // let's just test a large routing key too, 90 chars please :)
      routes:           ["--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---"],
      retries:          5,
      created:          created.toJSON(),
      deadline:         deadline.toJSON(),
      scopes:           [],
      payload:          {},
      metadata: {
        name:           "Unit testing task",
        description:    "Task created during unit tests",
        owner:          'jonsafj@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue'
      },
      tags: {
        purpose:        'taskcluster-testing'
      },
      extra: {
        myUsefulDetails: {
          property:     "that is useful by external service!!"
        }
      }
    };
    var taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:my-provisioner/az-queue-test',
      'queue:route:*'
    );
    debug("### Create task");
    return helper.queue.createTask(taskId, taskDef).then(function(result) {
      helper.scopes(
        'queue:poll-task-urls',
        'assume:worker-type:my-provisioner/az-queue-test'
      );
      debug("### Access Tasks from azure queue");
      return helper.queue.pollTaskUrls('my-provisioner', 'az-queue-test');
    }).then(function(result) {
      assert(result.signedPollTaskUrls.length > 0, "Missing signedPollTaskUrl");
      helper.scopes(
        'queue:claim-task',
        'assume:worker-type:my-provisioner/az-queue-test',
        'assume:worker-id:dummy-workers/test-worker'
      );
      var i = 0;
      return helper.poll(function() {
        debug("### Polling azure queue: %s", i);
        return request
        .get(result.signedPollTaskUrls[i++ % result.signedPollTaskUrls.length])
        .buffer()
        .end()
        .then(function(res) {
          assert(res.ok, "Request failed!");
          assert(res.text.indexOf('<MessageText>') !== -1,
                 "Must have a message");
          return res.text;
        }).then(function(data) {
          return new Promise(function(accept, reject) {
            xml2js.parseString(data, function(err, json) {
              if (err) {
                return reject(err);
              }
              accept(json);
            });
          });
        }).then(function(data) {
          assert(data.QueueMessagesList.QueueMessage instanceof Array,
                 "Expected result");
          var msg = data.QueueMessagesList.QueueMessage[0];
          var payload = new Buffer(msg.MessageText[0], 'base64').toString();
          payload = JSON.parse(payload);
          assert(taskId === payload.taskId, "Got the wrong taskId");
          return helper.queue.claimTask(payload.taskId, payload.runId,{
            workerGroup:      'dummy-workers',
            workerId:         'test-worker',
            messageId:        msg.MessageId[0],
            receipt:          msg.PopReceipt[0],
            signature:        payload.signature
          });
        });
      });
    });
  });
});