import _ from 'lodash';
import { strict as assert } from 'assert';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeMatrix(mock, skipping);
  helper.withFakeSlack(mock, skipping);
  helper.withSES(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Dummy address for denylist tests
  let dummyAddress1 = {
    notificationType: "email",
    notificationAddress: "name1@name.com",
  };
  let dummyAddress2 = {
    notificationType: "matrix-room",
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
    await helper.apiClient.pulse({ routingKey: 'notify-test', message: { test: 123 } });
    helper.assertPulseMessage('notification', m => (
      _.isEqual(m.payload.message, { test: 123 }) &&
      _.isEqual(m.CCs, ['route.notify-test'])));
  });

  test('pulse() fails if pulse publish fails', async function() {
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });
    const apiClient = helper.apiClient.use({ retries: 0 });
    await assert.rejects(
      () => apiClient.pulse({ routingKey: 'notify-test', message: { test: 456 } }),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({ Type, Fields }) => Type === 'monitor.error' && Fields.message === 'uhoh',
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
      await helper.apiClient.pulse({ routingKey: 'notify-test', message: { test: 123 } });
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
      link: { text: 'Inspect Task', href: 'https://taskcluster.net/task-inspector/Z-tDsP4jQ3OUTjN0Q6LNKQ&foo=bar' },
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
        link: { text: 'Inspect Task', href: 'https://taskcluster.net/task-inspector/#Z-tDsP4jQ3OUTjN0Q6LNKQ' },
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

  test('matrix', async function() {
    await helper.apiClient.matrix({ body: 'Does this work?', roomId: '!foobar:baz.com', msgtype: 'm.text' });
    assert.equal(helper.matrixClient.sendEvent.callCount, 1);
    assert.equal(helper.matrixClient.sendEvent.args[0][0], '!foobar:baz.com');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].body, 'Does this work?');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].msgtype, 'm.text');
    const monitor = await helper.load('monitor');
    assert(monitor.manager.messages.find(m => m.Type === 'matrix'));
    assert(monitor.manager.messages.find(m => m.Type === 'matrix-forbidden') === undefined);
  });

  test('matrix (default msgtype)', async function() {
    await helper.apiClient.matrix({ body: 'Does this work?', roomId: '!foobar:baz.com' });
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
      await helper.apiClient.matrix({ body: 'Does this work?', roomId: '!rejected:baz.com' });
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
    await helper.apiClient.addDenylistAddress({ notificationType: 'matrix-room', notificationAddress: '!foo:baz.com' });
    try {
      await helper.apiClient.matrix({ body: 'Does this work?', roomId: '!foo:baz.com' });
      throw new Error('should have failed');
    } catch (err) {
      if (err.code !== 'DenylistedAddress') {
        throw err;
      }
    }
  });

  test('slack', async function() {
    await helper.apiClient.slack({ channelId: 'C123456', text: 'Does this work?' });
    assert.equal(helper.slackClient.chat.postMessage.callCount, 1);
    assert.deepStrictEqual(helper.slackClient.chat.postMessage.args[0][0], {
      attachments: undefined,
      blocks: undefined,
      channel: 'C123456',
      text: 'Does this work?',
    });
    const monitor = await helper.load('monitor');
    assert(monitor.manager.messages.find(m => m.Type === 'slack'));
  });

  test('slack (denylisted)', async function() {
    await helper.apiClient.addDenylistAddress({ notificationType: 'slack-channel', notificationAddress: 'C123456' });
    try {
      await helper.apiClient.slack({ channelId: 'C123456', text: 'Does this work?' });
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
    await helper.db.fns.add_denylist_address(
      dummyAddress1.notificationType,
      dummyAddress1.notificationAddress,
    );
    let existsTable = await helper.db.fns.exists_denylist_address(
      dummyAddress1.notificationType,
      dummyAddress1.notificationAddress,
    );
    let exists = existsTable[0]["exists_denylist_address"];

    assert(exists);

    // Duplicate addresses should not throw an exception
    await helper.apiClient.addDenylistAddress(dummyAddress1);
  });

  test('Denylist: deleteDenylistAddress()', async function() {
    // Add some items
    await helper.apiClient.addDenylistAddress(dummyAddress1);
    await helper.apiClient.addDenylistAddress(dummyAddress2);

    // Make sure they are added
    let items = await helper.db.fns.all_denylist_addresses(1000, 0);
    assert(items.length, 2);

    // Remove an item and check for success
    await helper.apiClient.deleteDenylistAddress(dummyAddress1);
    items = await helper.db.fns.all_denylist_addresses(1000, 0);
    assert(items.length, 1);

    // Only dummyAddress2 should be left in the table
    let item = items[0];
    assert.equal(item["notification_address"], dummyAddress2["notificationAddress"]);
    assert.equal(item["notification_type"], dummyAddress2["notificationType"]);

    // Removing non-existant addresses should not throw an exception
    await helper.apiClient.deleteDenylistAddress(dummyAddress1);
  });

  test('Denylist: listDenylist()', async function() {
    // Call listDenylist() on an empty table
    let addressList = await helper.apiClient.listDenylist();
    assert(addressList.addresses, []);

    // Add some items
    await helper.apiClient.addDenylistAddress(dummyAddress1);
    await helper.apiClient.addDenylistAddress(dummyAddress2);

    // check the result of listDenylist()
    addressList = await helper.apiClient.listDenylist();
    let expectedResult = [dummyAddress1, dummyAddress2].sort();
    assert.deepEqual(addressList.addresses.sort(), expectedResult);
  });
});
