const assert = require('assert');
const helper = require('./helper');

helper.secrets.mockSuite(helper.suiteName(__filename), ['aws'], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withSES(mock, skipping);
  helper.withSQS(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.apiClient.ping();
  });

  test('pulse', async function() {
    await helper.apiClient.pulse({routingKey: 'notify-test', message: {test: 123}});
    helper.checkNextMessage('notification', m => {
      assert.deepEqual(m.payload.message, {test: 123});
      assert.deepEqual(m.CCs, ['route.notify-test']);
    });
  });

  test('email', async function() {
    await helper.apiClient.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
      link: {text: 'Inspect Task', href: 'https://tools.taskcluster.net/task-inspector/#Z-tDsP4jQ3OUTjN0Q6LNKQ'},
    });
    helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);
    });
  });

  test('email without link', async function() {
    await helper.apiClient.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
    });
    helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);
    });
  });

  test('email with fullscreen template', async function() {
    await helper.apiClient.email({
      address:'success@simulator.amazonses.com',
      subject:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content:'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
      template:'fullscreen',
    });
    helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);
    });
  });

  test('irc', async function() {
    await helper.apiClient.irc({message: 'Does this work?', channel: '#taskcluster-test'});
    await helper.checkSQSMessage(helper.ircSQSQueue, body => {
      assert.equal(body.channel, '#taskcluster-test');
      assert.equal(body.message, 'Does this work?');
    });
  });
});
