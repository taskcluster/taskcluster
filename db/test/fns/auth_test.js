const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const uuid = require('uuid');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'auth' });

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
