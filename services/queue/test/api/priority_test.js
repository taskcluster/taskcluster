suite("task.priority", () => {
  var debug       = require('debug')('test:api:createDefaults');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var assume      = require('assume');
  var request     = require('superagent-promise');
  var xml2js      = require('xml2js');
  var helper      = require('./helper');

  var makeTask = (priority) => {
    return {
      provisionerId:    'no-provisioner',
      workerType:       'priority-test-worker',
      priority:         priority,
      created:          taskcluster.fromNowJSON(),
      deadline:         taskcluster.fromNowJSON('30 min'),
      payload:          {},
      metadata: {
        name:           "Unit testing task",
        description:    "Task created during unit tests",
        owner:          'jonsafj@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue'
      }
    };
  };

  test("Can submit 'high' w. queue:task-priority:high", async () => {
    helper.scopes(
      'queue:create-task:no-provisioner/priority-test-worker',
      'queue:task-priority:high'
    );
    await helper.queue.createTask(slugid.v4(), makeTask('high'));
  });

  test("Can't submit 'high' without queue:task-priority:high", async () => {
    helper.scopes(
      'queue:create-task:no-provisioner/priority-test-worker'
    );
    await helper.queue.createTask(slugid.v4(), makeTask('high')).then(() => {
      assert(false, "Expected 400 error!");
    }, err => {
      debug("Got error as expected");
    });
  });

  test("Can submit 'normal' without queue:task-priority:high", async () => {
    helper.scopes(
      'queue:create-task:no-provisioner/priority-test-worker'
    );
    await helper.queue.createTask(slugid.v4(), makeTask('normal'));
  });

  test("poll 'high' before 'low'", async () => {
    var highTaskId    = slugid.v4();
    var normalTaskId  = slugid.v4();

    debug("### Creating normal: %s and high: %s tasks",
          normalTaskId, highTaskId);
    await Promise.all([
      helper.queue.createTask(highTaskId, makeTask('high')),
      helper.queue.createTask(normalTaskId, makeTask('normal'))
    ]);

    debug("### Get signed poll urls");
    var {queues} = await helper.queue.pollTaskUrls(
      'no-provisioner', 'priority-test-worker'
    );
    assume(queues).is.not.empty();

    // Index of queue from which we got the high and normal task, respectively.
    var highIndex, normalIndex;

    // To test priority, we poll the queues alternating between all signed queue
    // urls until we find both messages... When we find the message for one of
    // tasks we've created, we store the index of the signedPollUrl from
    // queues and compare them after we've found both
    var i = 0;
    await base.testing.poll(async () => {
      var index = i++ % queues.length;

      debug("### Polling azure queue: %s", index);
      var queue = queues[index];
      var res = await request.get(queue.signedPollUrl).buffer().end();
      assume(res.ok).is.ok();

      // Parse XML
      var xml = await new Promise((accept, reject) => {
        xml2js.parseString(res.text, (err, json) => {
          err ? reject(err) : accept(json)
        });
      });

      // This will cause an error if there is no message, and the poll loop will
      // repeat, this is appropriate for testing only!
      assume(xml.QueueMessagesList.QueueMessage).is.an('array');

      var msg = xml.QueueMessagesList.QueueMessage[0];
      var payload = new Buffer(msg.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);
      debug("payload: %j", payload);

      if (payload.taskId === normalTaskId) {
        normalIndex = index;
      }
      if (payload.taskId === highTaskId) {
        highIndex = index;
      }

      if (normalIndex === undefined || highIndex === undefined) {
        throw new Error("Try again, we're missing a taskId");
      }
    });

    // Check that we found the index of the queue (from queues) that
    // contains high and normal task... And validate that normal has higher
    // index (ie. comes later in the list)
    assume(highIndex).is.a('number');
    assume(normalIndex).is.a('number');
    assume(normalIndex).is.greaterThan(highIndex);
  });

});