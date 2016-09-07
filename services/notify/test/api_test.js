suite('API', () => {
  let assert = require('assert');
  let helper = require('./helper');

  test('ping', () => {
    return helper.notify.ping();
  });

  test('pulse', async () => {
    await helper.events.listenFor('notification', helper.notifyEvents.notify({}));
    await helper.notify.pulse({routingKey: 'notify-test', message: {test: 123}});
    var message = await helper.events.waitFor('notification');
    assert.deepEqual(message.payload.message, {test: 123});
    assert.deepEqual(message.routes, ['notify-test']);
  });

  test('email', async (done) => {
    helper.sqs.receiveMessage({
      QueueUrl:             helper.emailSqsQueueUrl,
      AttributeNames:       ['ApproximateReceiveCount'],
      MaxNumberOfMessages:  10,
      VisibilityTimeout:    30,
      WaitTimeSeconds:      20,
    }).promise().then(async (resp) => {
      let m = resp.data.Messages;
      assert.equal(m.length, 1);
      await helper.sqs.deleteMessage({
        QueueUrl:       helper.emailSqsQueueUrl,
        ReceiptHandle:  m[0].ReceiptHandle,
      }).promise();
      let b = JSON.parse(m[0].Body);
      let j = JSON.parse(b.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
      done();
    }).catch(done);
    await helper.notify.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
      link: {text: 'Inspect Task', href: 'https://tools.taskcluster.net/task-inspector/#Z-tDsP4jQ3OUTjN0Q6LNKQ'},
    });
  });

  test('irc', async (done) => {
    helper.sqs.receiveMessage({
      QueueUrl:             helper.sqsQueueUrl,
      AttributeNames:       ['ApproximateReceiveCount'],
      MaxNumberOfMessages:  10,
      VisibilityTimeout:    30,
      WaitTimeSeconds:      20,
    }).promise().then(async (resp) => {
      let m = resp.data.Messages;
      assert.equal(m.length, 1);
      await helper.sqs.deleteMessage({
        QueueUrl:       helper.sqsQueueUrl,
        ReceiptHandle:  m[0].ReceiptHandle,
      }).promise();
      let j = JSON.parse(m[0].Body);
      assert.equal(j.channel, '#taskcluster-test');
      assert.equal(j.message, 'Does this work?');
      done();
    }).catch(done);
    await helper.notify.irc({message: 'Does this work?', channel: '#taskcluster-test'});
  });
});
