suite('Access tasks', function() {
  var debug       = require('debug')('test:api:create');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper')();
  var xml2js      = require('xml2js');
  var request     = require('superagent-promise');

  test("createTask, accessTasks, getMessage, deleteMessage", function() {
    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setMinutes(new Date().getMinutes() + 30);

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
        'queue:access-tasks',
        'assume:worker-type:my-provisioner/az-queue-test'
      );
      debug("### Access Tasks from azure queue");
      return helper.queue.accessTasks('my-provisioner', 'az-queue-test');
    }).then(function(result) {
      return helper.poll(function() {
        debug("### Polling azure queue");
        return request
        .get(result.signedGetMessageUrl)
        .buffer()
        .end()
        .then(function(res) {
          assert(res.ok, "Request failed!");
          return new Promise(function(accept, reject) {
            xml2js.parseString(res.text, function(err, json) {
              if (err) {
                return reject(err);
              }
              accept(json);
            });
          });
        }).then(function(data) {
          //debug(JSON.stringify(data, null, 2));
          var msg = data.QueueMessagesList.QueueMessage[0];
          var payload = JSON.parse(
            new Buffer(msg.MessageText[0], 'base64').toString()
          );
          assert(payload.status.taskId === taskId);
          debug("### Delete message from azure queue");
          return request
          .del(
            result.signedDeleteMessageUrl
              .replace('<messageId>', msg.MessageId)
              .replace('<receipt>', encodeURIComponent(msg.PopReceipt))
          )
          .buffer()
          .end()
          .then(function(res) {
            assert(res.ok, "Delete request failed");
          });
        });
      });
    });
  });
});