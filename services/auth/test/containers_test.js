const containers = require('../src/containers');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const azure = require('fast-azure-storage');

const sorted = (arr) => {
  arr.sort();
  return arr;
};

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  helper.withCfg(mock, skipping);

  if (mock) {
    return; // This test file only works on real things apparently
  }

  const containerName = helper.containerName;
  let credentials;
  let roles;

  suiteSetup(async function() {
    if (!mock && !skipping()) {
      credentials = helper.cfg.azure;
      roles = new containers.Roles({
        containerName,
        credentials,
      });

      await roles.setup();

      // zero out the container
      const blobService = new azure.Blob(credentials);
      try {
        await blobService.deleteBlob(containerName, "Roles", {});
      } catch (err) {
        if (err.code !== 'BlobNotFound') {
          throw err;
        }
        // ignore BlobNotFound here, as that's the desired result
      }
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
    const roles2 = new containers.Roles({
      containerName,
      credentials,
    });
    await roles2.setup();

    assert.deepEqual(sorted((await roles2.get()).map(r => r.roleId)),
      sorted(['my-role', 'second-role']));
  });
});
