suite('API', () => {
  let assert = require('assert');
  let helper = require('./helper');

  test('ping', () => {
    return helper.notify.ping();
  });

  test('pulse', async () => {
    let result = helper.publisher.on('fakePublish', message => {
      assert.deepEqual(message.payload.message, {test: 123});
      assert.deepEqual(message.CCs, ['route.notify-test']);
    });
    await helper.notify.pulse({routingKey: 'notify-test', message: {test: 123}});
    return result;
  });

  test('email', async () => {
    let result = helper.checkSqsMessage(helper.emailSqsQueueUrl, body => {
      let j = JSON.parse(body.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
    });
    await helper.notify.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
      link: {text: 'Inspect Task', href: 'https://tools.taskcluster.net/task-inspector/#Z-tDsP4jQ3OUTjN0Q6LNKQ'},
    });
    return result;
  });

  test('email without link', async () => {
    let result= helper.checkSqsMessage(helper.emailSqsQueueUrl, body => {
      let j = JSON.parse(body.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
    });
    await helper.notify.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
    });
    return result;
  });

  test('email with fullscreen template', async () => {
    let result = helper.checkSqsMessage(helper.emailSqsQueueUrl, body => {
      let j = JSON.parse(body.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
    });
    await helper.notify.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
      template:'fullscreen',
    });
    return result;
  });

  test('irc', async () => {
    let result = helper.checkSqsMessage(helper.sqsQueueUrl, body => {
      assert.equal(body.channel, '#taskcluster-test');
      assert.equal(body.message, 'Does this work?');
    });
    await helper.notify.irc({message: 'Does this work?', channel: '#taskcluster-test'});
    return result;
  });
});
