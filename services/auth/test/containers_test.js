const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const {modifyRoles} = require('../src/data');

const sorted = (arr) => {
  arr.sort();
  return arr;
};

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withCfg(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServers(mock, skipping);
  helper.resetTables(mock, skipping);

  test('get when blob is empty', async function() {
    assert.deepEqual(await helper.db.fns.get_roles(), []);
  });

  test('first modification of an empty blob', async function() {
    await modifyRoles(helper.db, ({ roles }) => {
      roles.push({
        role_id: 'my-role',
        scopes: ['a', 'b'],
        description: 'a role!',
        created: new Date('2017-01-01'),
        last_modified: new Date('2017-01-01'),
      });
    });

    assert.deepEqual(sorted((await helper.db.fns.get_roles()).map(r => r.role_id)),
      sorted(['my-role']));
  });

  test('add a second role', async function() {
    await modifyRoles(helper.db, ({ roles }) => {
      roles.push({
        role_id: 'my-role',
        scopes: ['a', 'b'],
        description: 'a role!',
        created: new Date('2017-01-01'),
        last_modified: new Date('2017-01-01'),
      });
    });
    await modifyRoles(helper.db, ({ roles }) => {
      roles.push({
        role_id: 'second-role',
        scopes: ['x', 'y'],
        description: 'a role!',
        created: new Date('2017-01-02'),
        last_modified: new Date('2017-01-02'),
      });
    });
    assert.deepEqual(sorted((await helper.db.fns.get_roles()).map(r => r.role_id)),
      sorted(['my-role', 'second-role']));
  });
});
