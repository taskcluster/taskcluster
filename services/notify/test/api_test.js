suite('API', () => {
  let assert = require('assert');
  let helper = require('./helper');

  test('ping', () => {
    return helper.notify.ping();
  });

  test('pulse', async (done) => {
    await helper.events.listenFor('notification', helper.notifyEvents.notify({}));
    helper.events.waitFor('notification').then(message => {
      assert.deepEqual(message.payload.message, {test: 123});
      assert.deepEqual(message.routes, ['notify-test']);
      done();
    }).catch(done);
    await helper.notify.pulse({routingKey: 'notify-test', message: {test: 123}});
  });

  test('email', async (done) => {
    helper.checkSqsMessage(helper.emailSqsQueueUrl, done, body => {
      let j = JSON.parse(body.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
    });
    await helper.notify.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
      link: {text: 'Inspect Task', href: 'https://tools.taskcluster.net/task-inspector/#Z-tDsP4jQ3OUTjN0Q6LNKQ'},
    });
  });

  test('email without link', async (done) => {
    helper.checkSqsMessage(helper.emailSqsQueueUrl, done, body => {
      let j = JSON.parse(body.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
    });
    await helper.notify.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
    });
  });

  test('irc', async (done) => {
    helper.checkSqsMessage(helper.sqsQueueUrl, done, body => {
      assert.equal(body.channel, '#taskcluster-test');
      assert.equal(body.message, 'Does this work?');
    });
    await helper.notify.irc({message: 'Does this work?', channel: '#taskcluster-test'});
  });
});
