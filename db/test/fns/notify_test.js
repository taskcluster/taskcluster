const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'notify' });

  setup('truncate denylisted_notifications', async function() {
    await helper.withDbClient(async client => {
      await client.query('truncate denylisted_notifications');
    });
  });

  helper.dbTest('update_widgets', async function(db, isFake) {
    // this function now does nothing
    const widgets = await db.fns.update_widgets("checkbox");
    const names = widgets.map(({name}) => name).sort();
    assert.deepEqual(names, []);
  });

  helper.dbTest('list denylisted notifications when there are none', async function(db, isFake) {
    const addresses = await db.fns.all_denylist_addresses(10, 0);
    assert.deepEqual(addresses, []);
  });

  helper.dbTest('list denylisted notifications when there is one row', async function(db, isFake) {
    let n1 = {
      notificationType: "email",
      notificationAddress: "pmoore@mozilla.com",
    };
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    const addresses = await db.fns.all_denylist_addresses(10, 0);
    assert.equal(addresses.length, 1);
    assert.equal(addresses[0]["notification_type"], n1.notificationType);
    assert.equal(addresses[0]["notification_address"], n1.notificationAddress);
  });

  helper.dbTest('add denylist address that already exists', async function(db, isFake) {
    let n1 = {
      notificationType: "email",
      notificationAddress: "pmoore@mozilla.com",
    };
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    const addresses = await db.fns.all_denylist_addresses(10, 0);
    assert.equal(addresses.length, 1);
    assert.equal(addresses[0]["notification_type"], n1.notificationType);
    assert.equal(addresses[0]["notification_address"], n1.notificationAddress);
  });

  helper.dbTest('delete denylist address that already exists', async function(db, isFake) {
    let n1 = {
      notificationType: "email",
      notificationAddress: "pmoore@mozilla.com",
    };
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    await db.fns.delete_denylist_address(n1.notificationType, n1.notificationAddress);
    const addresses = await db.fns.all_denylist_addresses(10, 0);
    assert.equal(addresses.length, 0);
  });

  helper.dbTest("delete denylist address that doesn't already exist", async function(db, isFake) {
    let n1 = {
      notificationType: "pulse",
      notificationAddress: "routing.key",
    };
    let n2 = {
      notificationType: "email",
      notificationAddress: "pmoore@mozilla.com",
    };
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    await db.fns.delete_denylist_address(n2.notificationType, n2.notificationAddress);
    const addresses = await db.fns.all_denylist_addresses(10, 0);
    assert.equal(addresses.length, 1);
    assert.equal(addresses[0]["notification_type"], n1.notificationType);
    assert.equal(addresses[0]["notification_address"], n1.notificationAddress);
  });

  helper.dbTest('test denylist address pagination', async function(db, isFake) {
    let n1 = {
      notificationType: "pulse",
      notificationAddress: "routing.key",
    };
    let n2 = {
      notificationType: "email",
      notificationAddress: "pmoore@mozilla.com",
    };
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    await db.fns.add_denylist_address(n2.notificationType, n2.notificationAddress);
    // paginate offset = 1 to skip first record
    // records sorted by notificationType, notificationAddress
    // so returned record should be n1 not n2
    const addresses = await db.fns.all_denylist_addresses(10, 1);
    assert.equal(addresses.length, 1);
    assert.equal(addresses[0]["notification_type"], n1.notificationType);
    assert.equal(addresses[0]["notification_address"], n1.notificationAddress);
  });

  helper.dbTest('test denylist existence check', async function(db, isFake) {
    let n1 = {
      notificationType: "pulse",
      notificationAddress: "routing.key",
    };
    let n2 = {
      notificationType: "email",
      notificationAddress: "pmoore@mozilla.com",
    };
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    await db.fns.add_denylist_address(n2.notificationType, n2.notificationAddress);
    const exists = await db.fns.exists_denylist_address(n2.notificationType, n2.notificationAddress);
    assert.equal(exists.length, 1);
    assert(!!exists[0]["exists_denylist_address"]);
  });

  helper.dbTest('test denylist nonexistence check', async function(db, isFake) {
    let n1 = {
      notificationType: "pulse",
      notificationAddress: "routing.key",
    };
    let n2 = {
      notificationType: "email",
      notificationAddress: "pmoore@mozilla.com",
    };
    let n3 = {
      notificationType: "irc-user",
      notificationAddress: "pmoore",
    };
    await db.fns.add_denylist_address(n1.notificationType, n1.notificationAddress);
    await db.fns.add_denylist_address(n2.notificationType, n2.notificationAddress);
    const exists = await db.fns.exists_denylist_address(n3.notificationType, n3.notificationAddress);
    assert.equal(exists.length, 1);
    assert(!exists[0]["exists_denylist_address"]);
  });
});
