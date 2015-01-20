suite('Poll tasks', function() {
  var debug       = require('debug')('test:api:create');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper')();
  var request     = require('superagent-promise');

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
        'queue:poll-task',
        'assume:worker-type:my-provisioner/az-queue-test'
      );
      debug("### Access Tasks from azure queue");
      return helper.queue.pollTaskUrl('my-provisioner', 'az-queue-test');
    }).then(function(result) {
      assert(result.signedPollTaskUrl, "Missing signedPollTaskUrl");
      helper.scopes(
        'queue:claim-task',
        'assume:worker-type:my-provisioner/az-queue-test',
        'assume:worker-id:dummy-workers/test-worker'
      );
      return helper.poll(function() {
        debug("### Polling azure queue");
        return request
        .get(result.signedPollTaskUrl)
        .buffer()
        .end()
        .then(function(res) {
          assert(res.ok, "Request failed!");
          assert(res.text.indexOf('<MessageText>') !== -1,
                 "Must have a message");
          return res.text;
        }).then(function(data) {
          return helper.queue.claimWork('my-provisioner', 'az-queue-test',{
            workerGroup:      'dummy-workers',
            workerId:         'test-worker',
            xmlMessage:       data
          });
        });
      });
    });
  });
});