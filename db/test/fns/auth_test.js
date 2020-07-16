const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const {UNIQUE_VIOLATION} = require('taskcluster-lib-postgres');
const uuid = require('uuid');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'auth' });

  suite('roles', function() {
    // make a role with default values
    const mkrole = ({role_id, scopes}) => ({
      role_id,
      scopes: scopes || [],
      description: 'a role',
      created: new Date(2020, 7, 15),
      last_modified: new Date(2020, 7, 15),
    });

    setup('truncate roles', async function() {
      await helper.withDbClient(async client => {
        await client.query('truncate roles');
      });
    });

    helper.dbTest('get_roles when there are none', async function(db) {
      const roles = await db.fns.get_roles();
      assert.deepEqual(roles, []);
    });

    helper.dbTest('modify_roles when no roles exist', async function(db) {
      const etag = uuid.v4();
      await db.fns.modify_roles(JSON.stringify([mkrole({role_id: 'abc'})]), etag);
      const roles = await db.fns.get_roles();
      assert.deepEqual(roles.map(({etag, ...rest}) => rest), [mkrole({role_id: 'abc'})]);
    });

    helper.dbTest('modify_roles when roles do exist, no conflict', async function(db) {
      const etag = uuid.v4();
      await db.fns.modify_roles(JSON.stringify([mkrole({role_id: 'abc'})]), etag);
      const roles1 = await db.fns.get_roles();
      await db.fns.modify_roles(JSON.stringify([mkrole({role_id: 'def'})]), roles1[0].etag);
      const roles2 = await db.fns.get_roles();
      assert.deepEqual(roles2.map(r => r.role_id), ['def']);
    });

    helper.dbTest('modify_roles when roles do exist, with conflict', async function(db) {
      const etag = uuid.v4();
      await db.fns.modify_roles(JSON.stringify([mkrole({role_id: 'abc'})]), etag);
      await assert.rejects(
        () => db.fns.modify_roles(JSON.stringify([mkrole({role_id: 'def'})]), etag),
        err => err.code === 'P0004');
      const roles = await db.fns.get_roles();
      assert.deepEqual(roles.map(r => r.role_id), ['abc']);
    });
  });

  suite('clients', function() {
    setup('truncate clients', async function() {
      await helper.withDbClient(async client => {
        await client.query('truncate clients');
      });
    });

    const create = async (db, client_id, {expires, delete_on_expiration} = {}) => {
      await db.fns.create_client(
        client_id,
        'Some client...',
        db.encrypt({ value: Buffer.from('sekrit', 'utf8') }),
        expires || new Date(),
        false,
        JSON.stringify([]),
        !!delete_on_expiration,
      );
    };

    helper.dbTest('get_client when it does not exixt', async function(db) {
      const clients = await db.fns.get_client('some-client');
      assert.deepEqual(clients, []);
    });

    helper.dbTest('create and get a client', async function(db) {
      const expires = new Date();
      await db.fns.create_client(
        'some-client',
        'Some client...',
        db.encrypt({ value: Buffer.from('sekrit', 'utf8') }),
        expires,
        false,
        JSON.stringify(['scope1']),
        false,
      );

      const [client] = await db.fns.get_client('some-client');
      assert.deepEqual(client.client_id, 'some-client');
      assert.deepEqual(client.description, 'Some client...');
      assert.deepEqual(db.decrypt({ value: client.encrypted_access_token }).toString('utf8'), 'sekrit');
      assert.deepEqual(client.expires, expires);
      assert.deepEqual(client.disabled, false);
      assert.deepEqual(client.scopes, ['scope1']);
      assert.deepEqual(client.delete_on_expiration, false);

      const aboutNow = d => Math.abs(d.getTime() - Date.now()) < 10000;
      assert(aboutNow(client.last_modified), client.last_modified);
      assert(aboutNow(client.last_date_used), client.last_date_used);
      assert(aboutNow(client.last_rotated), client.last_rotated);
    });

    helper.dbTest('create a client that exists -> UNIQUE_VIOLATION', async function(db) {
      await create(db, 'some-client');
      await assert.rejects(
        () => create(db, 'some-client'),
        err => err.code === UNIQUE_VIOLATION);
    });

    helper.dbTest('get_clients with a prefix', async function(db) {
      await Promise.all([
        create(db, 'abc/1'),
        create(db, 'abc/2'),
        create(db, 'abc/3'),
        create(db, 'def/1'),
      ]);
      const clients = await db.fns.get_clients('abc/', null, null);
      assert.deepEqual(clients.map(c => c.client_id), ['abc/1', 'abc/2', 'abc/3']);
    });

    helper.dbTest('get_clients with pagination', async function(db) {
      await Promise.all([
        create(db, 'abc/1'),
        create(db, 'abc/2'),
        create(db, 'abc/3'),
        create(db, 'abc/4'),
      ]);
      const clients = await db.fns.get_clients(null, 2, null);
      assert.deepEqual(clients.map(c => c.client_id), ['abc/1', 'abc/2']);
      const clients2 = await db.fns.get_clients(null, 3, 2);
      assert.deepEqual(clients2.map(c => c.client_id), ['abc/3', 'abc/4']);
    });

    helper.dbTest('get_clients with prefix and pagination', async function(db) {
      await Promise.all([
        create(db, 'abc/1'),
        create(db, 'def/2'),
        create(db, 'abc/3'),
        create(db, 'abc/4'),
      ]);
      const clients = await db.fns.get_clients('abc/', 2, null);
      assert.deepEqual(clients.map(c => c.client_id), ['abc/1', 'abc/3']);
    });

    helper.dbTest('delete a client', async function(db) {
      await create(db, 'some-client');
      await db.fns.delete_client('some-client');
      const clients = await db.fns.get_client('some-client');
      assert.deepEqual(clients, []);
    });

    helper.dbTest('update a client, changing nothing', async function(db) {
      const expires = new Date();
      await db.fns.create_client(
        'some-client',
        'Some client...',
        db.encrypt({ value: Buffer.from('sekrit', 'utf8') }),
        expires,
        false,
        JSON.stringify(['scope1']),
        false,
      );
      const [client1] = await db.fns.get_client('some-client');

      // wait long enough for the last-modified to change
      await testing.sleep(10);

      await db.fns.update_client(
        'some-client',
        null, null, null, null, null, null);

      const [client2] = await db.fns.get_client('some-client');
      assert.deepEqual(client2.client_id, 'some-client');
      assert.deepEqual(client2.description, 'Some client...');
      assert.deepEqual(db.decrypt({ value: client2.encrypted_access_token }).toString('utf8'), 'sekrit');
      assert.deepEqual(client2.expires, expires);
      assert.deepEqual(client2.disabled, false);
      assert.deepEqual(client2.scopes, ['scope1']);
      assert.deepEqual(client2.delete_on_expiration, false);

      // last modified was updated, but not last_rotated
      assert.notDeepEqual(client1.last_modified, client2.last_modified);
      assert.deepEqual(client1.last_rotated, client2.last_rotated);
    });

    helper.dbTest('update a client, changing everything', async function(db) {
      const expires = new Date();
      await db.fns.create_client(
        'some-client',
        'Some client...',
        db.encrypt({ value: Buffer.from('sekrit', 'utf8') }),
        expires,
        false,
        JSON.stringify(['scope1']),
        false,
      );
      const [client1] = await db.fns.get_client('some-client');

      // wait long enough for the last-modified to change
      await testing.sleep(10);

      const expires2 = new Date();
      const [updated] = await db.fns.update_client(
        'some-client',
        'updated',
        db.encrypt({ value: Buffer.from('UPDATED', 'utf8') }),
        expires2,
        true,
        JSON.stringify(['scope1', 'scope2']),
        true,
      );

      const [client2] = await db.fns.get_client('some-client');
      assert.deepEqual(updated, client2);

      assert.deepEqual(client2.client_id, 'some-client');
      assert.deepEqual(client2.description, 'updated');
      assert.deepEqual(db.decrypt({ value: client2.encrypted_access_token }).toString('utf8'), 'UPDATED');
      assert.deepEqual(client2.expires, expires2);
      assert.deepEqual(client2.disabled, true);
      assert.deepEqual(client2.scopes, ['scope1', 'scope2']);
      assert.deepEqual(client2.delete_on_expiration, true);

      // last_modified and last_rotated were updated
      assert.notDeepEqual(client1.last_modified, client2.last_modified);
      assert.notDeepEqual(client1.last_rotated, client2.last_rotated);
    });

    helper.dbTest('update a client last_date_used', async function(db) {
      const expires = new Date();
      await db.fns.create_client(
        'some-client',
        'Some client...',
        db.encrypt({ value: Buffer.from('sekrit', 'utf8') }),
        expires,
        false,
        JSON.stringify(['scope1']),
        false,
      );
      const [client1] = await db.fns.get_client('some-client');

      // wait long enough for the last-date-used to change
      await testing.sleep(10);

      await db.fns.update_client_last_used('some-client');

      const [client2] = await db.fns.get_client('some-client');
      assert.deepEqual(client2.client_id, 'some-client');
      assert.deepEqual(client2.description, 'Some client...');
      assert.deepEqual(db.decrypt({ value: client2.encrypted_access_token }).toString('utf8'), 'sekrit');
      assert.deepEqual(client2.expires, expires);
      assert.deepEqual(client2.disabled, false);
      assert.deepEqual(client2.scopes, ['scope1']);
      assert.deepEqual(client2.delete_on_expiration, false);

      // last_modified and last_rotated were not updated, but last_date_used was
      assert.deepEqual(client1.last_modified, client2.last_modified);
      assert.deepEqual(client1.last_rotated, client2.last_rotated);
      assert.notDeepEqual(client1.last_date_used, client2.last_date_used);
    });

    helper.dbTest('expire clients', async function(db) {
      await Promise.all([
        create(db, 'old', {expires: taskcluster.fromNow('-1 hour'), delete_on_expiration: true}),
        create(db, 'old-keep', {expires: taskcluster.fromNow('-1 hour'), delete_on_expiration: false}),
        create(db, 'new', {expires: taskcluster.fromNow('1 hour'), delete_on_expiration: true}),
        create(db, 'new-keep', {expires: taskcluster.fromNow('1 hour'), delete_on_expiration: false}),
      ]);

      await db.fns.expire_clients();

      const clients = await db.fns.get_clients(null, null, null);
      assert.deepEqual(clients.map(c => c.client_id), ['new', 'new-keep', 'old-keep']);
    });
  });
});
