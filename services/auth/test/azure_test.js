const assert = require('assert');
const helper = require('./helper');
const _ = require('lodash');
const azure = require('fast-azure-storage');
const taskcluster = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  if (mock) {
    return; // We only test this with real creds
  }
  helper.withCfg(mock, skipping);
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServers(mock, skipping);
  helper.resetTables(mock, skipping);

  let testaccount;
  suiteSetup('get azure test account name', async function() {
    const cfg = await helper.load('cfg');
    testaccount = _.keys(cfg.azureAccounts)[0];
  });

  test('azureAccounts', function() {
    return helper.apiClient.azureAccounts().then(function(result) {
      assert.deepEqual(result.accounts, _.keys(helper.cfg.azureAccounts));
    });
  });

  test('azureTables', async function() {
    // First make sure the table exists
    await helper.apiClient.azureTableSAS(
      testaccount,
      'TestTable',
      'read-write',
    );
    let extra = {};
    do {
      const result = await helper.apiClient.azureTables(testaccount, extra);
      extra.continuationToken = result.continuationToken;
      if (result.tables.includes('TestTable')) {
        return;
      }
    } while (extra.continuationToken);
    assert(false, 'TestTable was not in account!');
  });

  test('azureTables with undefined account', async function() {
    await assert.rejects(
      helper.apiClient.azureTables('nosuchaccount'),
      err => err.statusCode === 404);
  });

  test('azureTableSAS', function() {
    return helper.apiClient.azureTableSAS(
      testaccount,
      'TestTable',
      'read-write',
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
    });
  });

  test('azureTableSAS (read-write)', async function() {
    let res = await helper.apiClient.azureTableSAS(
      testaccount,
      'TestTable',
      'read-write',
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
      return result;
    });
    let table = new azure.Table({
      accountId: testaccount,
      sas: res.sas,
    });
    // This should not error since this is read-write
    return table.insertEntity('TestTable', { PartitionKey: taskcluster.slugid(), RowKey: 'c' });
  });

  test('azureTableSAS (read-only)', async function() {
    let res = await helper.apiClient.azureTableSAS(
      testaccount,
      'TestTable',
      'read-only',
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
      return result;
    });
    let table = new azure.Table({
      accountId: testaccount,
      sas: res.sas,
    });
    // This should not error since this is read-write
    return table.insertEntity('TestTable', { PartitionKey: taskcluster.slugid(), RowKey: 'c' }).then(() => {
      assert(false, 'This should not have been allowed to write!');
    }, (err) => {
      assert.equal(err.code, 'ResourceNotFound', 'This should not be able to see the table at all.');
    });
  });

  test('azureTableSAS (invalid level)', function() {
    return helper.apiClient.azureTableSAS(
      testaccount,
      'TestTable',
      'foo-bar-baz',
    ).then(function(result) {
      assert(false, 'This should have thrown an error');
    }).catch(function(err) {
      assert.equal(err.code, 'InvalidRequestArguments');
    });
  });

  test('azureTableSAS (allowed table)', () => {
    // Restrict access a bit
    helper.setupScopes(
      `auth:azure-table:read-write:${testaccount}/allowedTable`,
    );
    return helper.apiClient.azureTableSAS(
      testaccount,
      'allowedTable',
      'read-write',
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
    });
  });

  test('azureTableSAS (allowed table rw -> ro)', function() {
    // Restrict access a bit
    helper.setupScopes(
      `auth:azure-table:read-write:${testaccount}/allowedTable`,
    );
    return helper.apiClient.azureTableSAS(
      testaccount,
      'allowedTable',
      'read-only',
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
    });
  });

  test('azureTableSAS (too high permission)', function() {
    // Restrict access a bit
    helper.setupScopes(
      `auth:azure-table:read-only:${testaccount}/allowedTable`,
    );
    return helper.apiClient.azureTableSAS(
      testaccount,
      'allowedTable',
      'read-write',
    ).then(function(result) {
      assert(false, 'Expected an authentication error!');
    }, function(err) {
      assert(err.statusCode === 403, 'Expected authorization error!');
    });
  });

  test('azureTableSAS (unauthorized table)', function() {
    // Restrict access a bit
    helper.setupScopes(
      `auth:azure-table:read-write:${testaccount}/allowedTable`,
    );
    return helper.apiClient.azureTableSAS(
      testaccount,
      'unauthorizedTable',
      'read-write',
    ).then(function(result) {
      assert(false, 'Expected an authentication error!');
    }, function(err) {
      assert(err.statusCode === 403, 'Expected authorization error!');
    });
  });

  test('azureContainerSAS', async () => {
    let result = await helper.apiClient.azureContainerSAS(
      testaccount,
      'container-test',
      'read-write',
    );

    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');
  });

  test('azureContainerSAS (read-write)', async () => {
    let result = await helper.apiClient.azureContainerSAS(
      testaccount,
      'container-test',
      'read-write',
    );
    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');

    let blob = new azure.Blob({
      accountId: testaccount,
      sas: result.sas,
    });

    result = await blob.putBlob('container-test', 'blobTest', { type: 'BlockBlob' });
    assert(result);
  });

  test('azureContainers', async function() {
    let extra = {};
    do {
      const result = await helper.apiClient.azureContainers(testaccount, extra);
      extra.continuationToken = result.continuationToken;
      if (result.containers.includes('container-test')) {
        return;
      }
    } while (extra.continuationToken);
    assert(false, 'container was not in account!');
  });

  test('azureContainers with unknown account', async function() {
    await assert.rejects(
      () => helper.apiClient.azureContainers('nosuch'),
      err => err.statusCode === 404);
  });

  test('azureContainerSAS (read-only)', async () => {
    let result = await helper.apiClient.azureContainerSAS(
      testaccount,
      'container-test',
      'read-only',
    );
    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');

    let blob = new azure.Blob({
      accountId: testaccount,
      sas: result.sas,
    });

    try {
      await blob.putBlob('container-test', 'blobTest', { type: 'BlockBlob' });
    } catch (error) {
      assert.equal(error.code, 'AuthorizationPermissionMismatch');
      return;
    }
    assert(false, 'This should have thrown an error because the write is not allowed.');
  });

  test('azureContainerSAS (invalid level)', async () => {
    try {
      await helper.apiClient.azureContainerSAS(
        testaccount,
        'container-test',
        'foo-bar-baz',
      );
    } catch (error) {
      assert.equal(error.code, 'InvalidRequestArguments');
      return;
    }
    assert(false, 'This should have thrown an error');
  });

  test('azureContainerSAS (allowed container)', async () => {
    helper.setupScopes(
      `auth:azure-container:read-write:${testaccount}/allowed-container`,
    );

    let result = await helper.apiClient.azureContainerSAS(
      testaccount,
      'allowed-container',
      'read-write',
    );

    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');
  });

  test('azureContainerSAS (allowed read-write -> read-only)', async () => {
    helper.setupScopes(
      `auth:azure-container:read-write:${testaccount}/allowed-container`,
    );

    let result = await helper.apiClient.azureContainerSAS(
      testaccount,
      'allowed-container',
      'read-only',
    );
    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');
  });

  test('azureContainerSAS (unauthorized container)', async () => {
    helper.setupScopes(
      `auth:azure-container:read-write:${testaccount}/allowed-container`,
    );
    try {
      await helper.apiClient.azureContainerSAS(
        testaccount,
        'unauthorized-container',
        'read-write',
      );
    } catch (error) {
      assert(error.statusCode === 403, 'Expected authorization error!');
      return;
    }
    assert(false, 'Expected an authentication error!');
  });
});
