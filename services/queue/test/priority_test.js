suite('task.priority', () => {
  var debug       = require('debug')('test:priority');
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

  // Generate random workerType id to use for this test
  var workerType  = slugid.v4();

  var makeTask = (priority) => {
    return {
      provisionerId:    'no-provisioner',
      workerType:       workerType,
      priority:         priority,
      created:          taskcluster.fromNowJSON(),
      deadline:         taskcluster.fromNowJSON('30 min'),
      payload:          {},
      metadata: {
        name:           'Unit testing task',
        description:    'Task created during unit tests',
        owner:          'jonsafj@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue',
      },
    };
  };

  test('Can create "high" w. queue:task-priority:high', async () => {
    helper.scopes(
      'queue:create-task:no-provisioner/' + workerType,
      'queue:task-priority:high',
    );
    await helper.queue.createTask(slugid.v4(), makeTask('high'));
  });

  test('Can\'t create "high" without queue:task-priority:high', async () => {
    helper.scopes(
      'queue:create-task:no-provisioner/' + workerType,
    );
    await helper.queue.createTask(slugid.v4(), makeTask('high')).then(() => {
      assert(false, 'Expected 400 error!');
    }, err => {
      debug('Got error as expected');
    });
  });

  test('Can create "normal" without queue:task-priority:high', async () => {
    helper.scopes(
      'queue:create-task:no-provisioner/' + workerType,
    );
    await helper.queue.createTask(slugid.v4(), makeTask('normal'));
  });

  test('Can define "high" w. queue:task-priority:high', async () => {
    helper.scopes(
      'queue:define-task:no-provisioner/' + workerType,
      'queue:task-priority:high',
    );
    await helper.queue.defineTask(slugid.v4(), makeTask('high'));
  });

  test('Can\'t define "high" without queue:task-priority:high', async () => {
    helper.scopes(
      'queue:define-task:no-provisioner/' + workerType,
    );
    await helper.queue.defineTask(slugid.v4(), makeTask('high')).then(() => {
      assert(false, 'Expected 400 error!');
    }, err => {
      debug('Got error as expected');
    });
  });

  test('Can define "normal" without queue:task-priority:high', async () => {
    helper.scopes(
      'queue:define-task:no-provisioner/' + workerType,
    );
    await helper.queue.defineTask(slugid.v4(), makeTask('normal'));
  });

  test('poll "high" before "low"', async () => {
    var highTaskId    = slugid.v4();
    var normalTaskId  = slugid.v4();

    debug('### Creating normal: %s and high: %s tasks',
          normalTaskId, highTaskId);
    await Promise.all([
      helper.queue.createTask(highTaskId, makeTask('high')),
      helper.queue.createTask(normalTaskId, makeTask('normal')),
    ]);

    debug('### Get signed poll urls');
    var {queues} = await helper.queue.pollTaskUrls(
      'no-provisioner', workerType
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

      debug('### Polling azure queue: %s', index);
      var queue = queues[index];
      var res = await request.get(
        queue.signedPollUrl + '&numofmessages=32'
      ).buffer().end();
      assume(res.ok).is.ok();

      // Parse XML
      var xml = await new Promise((accept, reject) => {
        xml2js.parseString(res.text, (err, json) => {
          err ? reject(err) : accept(json);
        });
      });

      // This will cause an error if there is no message, and the poll loop will
      // repeat, this is appropriate for testing only!
      assume(xml.QueueMessagesList.QueueMessage).is.an('array');

      for (let msg of xml.QueueMessagesList.QueueMessage) {
        try {
          var data = msg.MessageText[0];
          var payload = JSON.parse(new Buffer(data, 'base64').toString());
          debug('payload: %j', payload);
          if (payload.taskId === normalTaskId) {
            normalIndex = index;
          }
          if (payload.taskId === highTaskId) {
            highIndex = index;
          }

        } catch (err) {
          // Ignore errors here
          debug('err parsing message body: %s, JSON: %j', err, err, err.stack);
        }
      }

      if (normalIndex === undefined || highIndex === undefined) {
        throw new Error('Try again, we\'re missing a taskId');
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
