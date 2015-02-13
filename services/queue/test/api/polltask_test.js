suite('Poll tasks', function() {
  var debug       = require('debug')('test:api:poll');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var expect      = require('expect.js');
  var request     = require('superagent-promise');
  var xml2js      = require('xml2js');
  var helper      = require('./helper');

  test("pollTaskUrl, getMessage, claimTask, deleteMessage", async () => {
    // Use the same task definition for everything
    var taskDef = {
      provisionerId:    'no-provisioner',
      workerType:       'poll-test-worker',
      schedulerId:      'my-scheduler',
      taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
      // let's just test a large routing key too, 90 chars please :)
      routes:           ["--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---." +
                         "--- long routing key ---.--- long routing key ---"],
      retries:          5,
      created:          taskcluster.utils.fromNow(),
      deadline:         taskcluster.utils.fromNow('5 minutes'),
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

    debug("### Create task");
    helper.scopes(
      'queue:create-task:no-provisioner/poll-test-worker',
      'queue:route:*'
    );
    await helper.queue.createTask(taskId, taskDef)


    debug("### Access Tasks from azure queue");
    helper.scopes(
      'queue:poll-task-urls',
      'assume:worker-type:no-provisioner/poll-test-worker'
    );
    var r1 = await helper.queue.pollTaskUrls(
      'no-provisioner', 'poll-test-worker'
    );
    expect(r1.queues.length).to.be.greaterThan(0);


    helper.scopes(
      'queue:claim-task',
      'assume:worker-type:no-provisioner/poll-test-worker',
      'assume:worker-id:dummy-workers/test-worker'
    );
    var i = 0;
    var queue, msg, payload;
    // The poll loop retries if there is an error, this is an easy way to write
    // tests. Don't EVER do this is production code! You could end up with a
    // loop that just get messages and there by makes them invisible :)
    await base.testing.poll(async () => {
      debug("### Polling azure queue: %s", i);
      queue = r1.queues[i++ % r1.queues.length];
      var res = await request.get(queue.signedPollUrl).buffer().end();
      expect(res.ok).to.be.ok();

      // Parse XML
      var xml = await new Promise((accept, reject) => {
        xml2js.parseString(res.text, (err, json) => {
          err ? reject(err) : accept(json)
        });
      });

      // This will cause an error if there is no message, and the poll loop will
      // repeat, this is appropriate for testing only!
      expect(xml.QueueMessagesList.QueueMessage).to.be.an('array');

      msg = xml.QueueMessagesList.QueueMessage[0];
      payload = new Buffer(msg.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);
      debug("payload: %j", payload);

      // again this will skip if we didn't get the taskId we expected
      expect(payload.taskId).to.be(taskId);
    });

    await helper.queue.claimTask(payload.taskId, payload.runId, {
      workerGroup:      'dummy-workers',
      workerId:         'test-worker'
    });

    debug("### Deleting message from azure");
    var deleteUrl = queue.signedDeleteUrl
     .replace('{{messageId}}', encodeURIComponent(msg.MessageId[0]))
     .replace('{{popReceipt}}', encodeURIComponent(msg.PopReceipt[0]));
    await base.testing.poll(async () => {
      var res = await request.del(deleteUrl).buffer().end();
      if (!res.ok) {
        throw new Error("error deleting message: " + res.text + " deleteUrl: " +
                        deleteUrl);
      }
    }, 20, 500);
  });
});