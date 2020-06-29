const _ = require('lodash');
const assert = require('assert').strict;
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['db', 'aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeMatrix(mock, skipping);
  helper.withSES(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

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

  test('pulse() fails if pulse publish fails', async function() {
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });
    const apiClient = helper.apiClient.use({retries: 0});
    await assert.rejects(
      () => apiClient.pulse({routingKey: 'notify-test', message: {test: 456}}),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
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
    await helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);
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
    await helper.checkEmails(email => {
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
    await helper.checkEmails(email => {
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

  test('irc() fails if pulse publish fails', async function() {
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });
    const apiClient = helper.apiClient.use({retries: 0});
    await assert.rejects(
      () => apiClient.irc({message: 'no', channel: '#taskcluster-test'}),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
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

  test('matrix', async function() {
    await helper.apiClient.matrix({body: 'Does this work?', roomId: '!foobar:baz.com', msgtype: 'm.text'});
    assert.equal(helper.matrixClient.sendEvent.callCount, 1);
    assert.equal(helper.matrixClient.sendEvent.args[0][0], '!foobar:baz.com');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].body, 'Does this work?');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].msgtype, 'm.text');
    const monitor = await helper.load('monitor');
    assert(monitor.manager.messages.find(m => m.Type === 'matrix'));
    assert(monitor.manager.messages.find(m => m.Type === 'matrix-forbidden') === undefined);
  });

  test('matrix (default msgtype)', async function() {
    await helper.apiClient.matrix({body: 'Does this work?', roomId: '!foobar:baz.com'});
    assert.equal(helper.matrixClient.sendEvent.callCount, 1);
    assert.equal(helper.matrixClient.sendEvent.args[0][0], '!foobar:baz.com');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].body, 'Does this work?');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].msgtype, 'm.notice');
    const monitor = await helper.load('monitor');
    assert(monitor.manager.messages.find(m => m.Type === 'matrix'));
    assert(monitor.manager.messages.find(m => m.Type === 'matrix-forbidden') === undefined);
  });

  test('matrix (rejected)', async function() {
    try {
      await helper.apiClient.matrix({body: 'Does this work?', roomId: '!rejected:baz.com'});
      throw new Error('should have failed');
    } catch (err) {
      if (err.code !== 'InputError') {
        throw err;
      }
      assert.equal(helper.matrixClient.sendEvent.callCount, 1);
      assert.equal(helper.matrixClient.sendEvent.args[0][0], '!rejected:baz.com');
    }
  });

  test('matrix (denylisted)', async function() {
    await helper.apiClient.addDenylistAddress({notificationType: 'matrix-room', notificationAddress: '!foo:baz.com'});
    try {
      await helper.apiClient.matrix({body: 'Does this work?', roomId: '!foo:baz.com'});
      throw new Error('should have failed');
    } catch (err) {
      if (err.code !== 'DenylistedAddress') {
        throw err;
      }
    }
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
