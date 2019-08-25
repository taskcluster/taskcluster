const _ = require('lodash');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'aws'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withSES(mock, skipping);
  helper.withServer(mock, skipping);

  // Dummy address for denylist tests
  let dummyAddress1 = {
    notificationType: "email",
    notificationAddress: "name1@name.com",
  };
  let dummyAddress2 = {
    notificationType: "irc-user",
    notificationAddress: "username",
  };

  setup('reset notifier', async function() {
    const notifier = helper.load('notifier');
    notifier.hashCache = [];
  });

  test('ping', async function() {
    await helper.apiClient.ping();
  });

  test('pulse', async function() {
    await helper.apiClient.pulse({routingKey: 'notify-test', message: {test: 123}});
    helper.assertPulseMessage('notification', m => (
      _.isEqual(m.payload.message, {test: 123}) &&
      _.isEqual(m.CCs, ['route.notify-test'])));
  });

  test('does not send notifications to denylisted pulse address', async function() {
    // Add an address to the denylist
    await helper.apiClient.addDenylistAddress({
      notificationType: 'pulse',
      notificationAddress: 'notify-test',
    });

    // Ensure sending notification to that address fails with appropriate error
    try {
      await helper.apiClient.pulse({routingKey: 'notify-test', message: {test: 123}});
    } catch(e) {
      assert(e.code, 'DenylistedAddress');
    }

    helper.assertNoPulseMessage('notification');
  });

  test('email', async function() {
    await helper.apiClient.email({
      address: 'success@simulator.amazonses.com',
      subject: 'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
      content: 'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes. <img src=x onerror=alert(1)//>',
      link: {text: 'Inspect Task', href: 'https://taskcluster.net/task-inspector/Z-tDsP4jQ3OUTjN0Q6LNKQ&foo=bar'},
    });
    helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);

      // We "parse" the mime tree here and check that we've sanitized the html version.
      const boundary = /boundary="(.*)"/.exec(email.data)[1];
      for (const part of email.data.split(boundary)) {
        if (part.includes('Content-Type: text/html')) {
          assert(!part.includes('alert(1)'));
        }
      }
    });
  });

  test('does not send notifications to denylisted email address', async function() {
    // Add an address to the denylist
    await helper.apiClient.addDenylistAddress({
      notificationType: 'email',
      notificationAddress: 'success@simulator.amazonses.com',
    });
    // Ensure sending notification to that address fails with appropriate error
    try {
      await helper.apiClient.email({
        address: 'success@simulator.amazonses.com',
        subject: 'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is Complete',
        content: 'Task Z-tDsP4jQ3OUTjN0Q6LNKQ is finished. It took 124 minutes.',
        link: {text: 'Inspect Task', href: 'https://taskcluster.net/task-inspector/#Z-tDsP4jQ3OUTjN0Q6LNKQ'},
      });
    } catch(e) {
      if (e.code !== "DenylistedAddress") {
        throw e;
      }
      return;
    }
    throw new Error('expected an error');
  });

  test('email without link', async function() {
    await helper.apiClient.email({
      address: 'success@simulator.amazonses.com',
      subject: 'Task Z-tDsP4jQ3OUTjN0Q6LNKo is Complete',
      content: 'Task Z-tDsP4jQ3OUTjN0Q6LNKo is finished. It took 124 minutes.',
    });
    helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);
    });
  });

  test('email with fullscreen template', async function() {
    await helper.apiClient.email({
      address: 'success@simulator.amazonses.com',
      subject: 'Task Z-tDsP4jQ3OUTjN0Q6LNKp is Complete',
      content: 'Task Z-tDsP4jQ3OUTjN0Q6LNKp is finished. It took 124 minutes.',
      template: 'fullscreen',
    });
    helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);
    });
  });

  test('irc', async function() {
    await helper.apiClient.irc({message: 'Does this work?', channel: '#taskcluster-test'});
    helper.assertPulseMessage('irc-request', m => {
      const {channel, message} = m.payload;
      return _.isEqual(channel, '#taskcluster-test') &&
        _.isEqual(message, 'Does this work?');
    });
  });

  test('does not send notifications to denylisted irc channel', async function() {
    // Add an irc-channel address to the denylist
    await helper.apiClient.addDenylistAddress({
      notificationType: 'irc-channel',
      notificationAddress: '#taskcluster-test',
    });
    // Ensure sending notification to that address fails with appropriate error
    try {
      await helper.apiClient.irc({message: 'Does this work?', channel: '#taskcluster-test'});
    } catch(e) {
      if (e.code !== "DenylistedAddress") {
        throw e;
      }
      return;
    }
    throw new Error('expected an error');
  });

  test('does not send notifications to denylisted irc user', async function() {
    await helper.apiClient.addDenylistAddress({notificationType: 'irc-user', notificationAddress: 'notify-me'});
    try {
      await helper.apiClient.irc({message: 'Does this work?', user: 'notify-me'});
    } catch(e) {
      if (e.code !== "DenylistedAddress") {
        throw e;
      }
      return;
    }
    throw new Error('expected an error');
  });

  test('Denylist: addDenylistAddress()', async function() {
    // Try adding an address to the denylist
    await helper.apiClient.addDenylistAddress(dummyAddress1);

    // Check that the address was successfully added
    let item = await helper.DenylistedNotification.load(dummyAddress1);
    item = item._properties;
    assert.deepEqual(item, dummyAddress1);

    // Duplicate addresses should not throw an exception
    await helper.apiClient.addDenylistAddress(dummyAddress1);
  });

  test('Denylist: deleteDenylistAddress()', async function() {
    // Add some items
    await helper.apiClient.addDenylistAddress(dummyAddress1);
    await helper.apiClient.addDenylistAddress(dummyAddress2);

    // Make sure they are added
    let items = await helper.DenylistedNotification.scan({});
    items = items.entries;
    assert(items.length, 2);

    // Remove an item and check for success
    await helper.apiClient.deleteDenylistAddress(dummyAddress1);
    items = await helper.DenylistedNotification.scan({});
    items = items.entries;
    assert(items.length, 1);

    // Only dummyAddress2 should be left in the table
    let item = items[0]._properties;
    assert.deepEqual(item, dummyAddress2);

    // Removing non-existant addresses should not throw an exception
    await helper.apiClient.deleteDenylistAddress(dummyAddress1);
  });

  test('Denylist: listDenylist()', async function() {
    // Call listDenylist() on an empty table
    let addressList = await helper.apiClient.listDenylist();
    assert(addressList.addresses, []);

    // Add some items
    await helper.DenylistedNotification.create(dummyAddress1);
    await helper.DenylistedNotification.create(dummyAddress2);

    // check the result of listDenylist()
    addressList = await helper.apiClient.listDenylist();
    let expectedResult = [dummyAddress1, dummyAddress2].sort();
    assert.deepEqual(addressList.addresses.sort(), expectedResult);
  });
});
