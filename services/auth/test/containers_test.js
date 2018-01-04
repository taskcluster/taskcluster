const containers = require('../src/containers');
const uuid = require('uuid');
const assert = require('assert');
const helper = require('./helper');
const azure = require('fast-azure-storage');
const DataContainer = require('azure-blob-storage');

const sorted = (arr) => {
  arr.sort();
  return arr;
};

suite('containers', function() {
  const containerName = `auth-test-${uuid.v4()}`;

  let credentials;
  if (helper.cfg.azure && helper.cfg.azure.accountName) {
    credentials = helper.cfg.azure;
  }

  let roles;
  suiteSetup(async function() {
    if (credentials) {
      roles = new containers.Roles({
        containerName,
        credentials,
      });

      await roles.setup();
    }
  });

  setup(function() {
    // can't run these tests without real azure credentials
    if (!credentials) {
      this.skip();
    }
  });

  test('get when blob is empty', async function() {
    assert.deepEqual(await roles.get(), []);
  });

  test('first modification of an empty blob', async function() {
    await roles.modify((roles) => {
      roles.push({
        roleId: 'my-role',
        scopes: ['a', 'b'],
        description: 'a role!',
        created: new Date('2017-01-01').toJSON(),
        lastModified: new Date('2017-01-01').toJSON(),
      });
    });
    assert.deepEqual(sorted((await roles.get()).map(r => r.roleId)),
      sorted(['my-role']));
  });

  test('add a second role', async function() {
    await roles.modify((roles) => {
      roles.push({
        roleId: 'second-role',
        scopes: ['x', 'y'],
        description: 'a role!',
        created: new Date('2017-01-02').toJSON(),
        lastModified: new Date('2017-01-02').toJSON(),
      });
    });
    assert.deepEqual(sorted((await roles.get()).map(r => r.roleId)),
      sorted(['my-role', 'second-role']));
  });

  test('create a second DataContainer', async function() {
    // this verifies that creating a container doesn't erase the roles!
    roles2 = new containers.Roles({
      containerName,
      credentials,
    });
    await roles2.setup();

    assert.deepEqual(sorted((await roles2.get()).map(r => r.roleId)),
      sorted(['my-role', 'second-role']));
  });

  // clean up the container manually at the end
  suiteTeardown(async function() {
    if (credentials) {
      const blobService = new azure.Blob({
        accountId: credentials.accountName,
        accountKey: credentials.accountKey,
      });
      try {
        await blobService.deleteContainer(containerName);
      } catch (e) {
        if (e.code !== 'ResourceNotFound') {
          throw e;
        }
        // already deleted, so nothing to do
        // NOTE: really, this doesn't work -- the container doesn't register as existing
        // before the tests are complete, so we "leak" containers despite this effort to
        // clean them up.
      }
    }
  });
});
