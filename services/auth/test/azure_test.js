const assert = require('assert');
const debug = require('debug')('auth:test:azure');
const helper = require('./helper');
const slugid = require('slugid');
const _ = require('lodash');
const azure = require('fast-azure-storage');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(helper.suiteName(__filename), ['app', 'azure'], function(mock, skipping) {
  if (mock) {
    return; // We only test this with real creds
  }
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withRoles(mock, skipping);
  helper.withServers(mock, skipping);
  helper.withCfg(mock, skipping);

  test('azureAccounts', function() {
    return helper.apiClient.azureAccounts(
    ).then(function(result) {
      assert.deepEqual(result.accounts, _.keys(helper.cfg.app.azureAccounts));
    });
  });

  test('azureTables', async function() {
    // First make sure the table exists
    await helper.apiClient.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'read-write'
    );
    return helper.apiClient.azureTables(
      helper.testaccount,
    ).then(function(result) {
      assert(result.tables.includes('TestTable'));
    });
  });

  test('azureTableSAS', function() {
    return helper.apiClient.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'read-write'
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
    });
  });

  test('azureTableSAS (read-write)', async function() {
    let res = await helper.apiClient.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'read-write',
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
      return result;
    });
    let table = new azure.Table({
      accountId: helper.testaccount,
      sas: res.sas,
    });
    // This should not error since this is read-write
    return table.insertEntity('TestTable', {PartitionKey: taskcluster.slugid(), RowKey: 'c'});
  });

  test('azureTableSAS (read-only)', async function() {
    let res = await helper.apiClient.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'read-only',
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
      return result;
    });
    let table = new azure.Table({
      accountId: helper.testaccount,
      sas: res.sas,
    });
    // This should not error since this is read-write
    return table.insertEntity('TestTable', {PartitionKey: taskcluster.slugid(), RowKey: 'c'}).then(() => {
      assert(false, 'This should not have been allowed to write!');
    }, (err) => {
      assert.equal(err.code, 'ResourceNotFound', 'This should not be able to see the table at all.');
    });
  });

  test('azureTableSAS (invalid level)', function() {
    return helper.apiClient.azureTableSAS(
      helper.testaccount,
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
      'auth:azure-table:read-write:' + helper.testaccount + '/allowedTable',
    );
    return helper.apiClient.azureTableSAS(
      helper.testaccount,
      'allowedTable',
      'read-write'
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
    });
  });

  test('azureTableSAS (allowed table rw -> ro)', function() {
    // Restrict access a bit
    helper.setupScopes(
      'auth:azure-table:read-write:' + helper.testaccount + '/allowedTable',
    );
    return helper.apiClient.azureTableSAS(
      helper.testaccount,
      'allowedTable',
      'read-only'
    ).then(function(result) {
      assert(typeof result.sas === 'string', 'Expected some form of string');
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
        'Expected expiry to be in the future');
    });
  });

  test('azureTableSAS (too high permission)', function() {
    // Restrict access a bit
    let auth = helper.setupScopes(
      'auth:azure-table:read-only:' + helper.testaccount + '/allowedTable',
    );
    return helper.apiClient.azureTableSAS(
      helper.testaccount,
      'allowedTable',
      'read-write'
    ).then(function(result) {
      assert(false, 'Expected an authentication error!');
    }, function(err) {
      assert(err.statusCode == 403, 'Expected authorization error!');
    });
  });

  test('azureTableSAS (unauthorized table)', function() {
    // Restrict access a bit
    let auth = helper.setupScopes(
      'auth:azure-table:read-write:' + helper.testaccount + '/allowedTable',
    );
    return helper.apiClient.azureTableSAS(
      helper.testaccount,
      'unauthorizedTable',
      'read-write'
    ).then(function(result) {
      assert(false, 'Expected an authentication error!');
    }, function(err) {
      assert(err.statusCode == 403, 'Expected authorization error!');
    });
  });

  test('azureContainerSAS', async () => {
    let result = await helper.apiClient.azureContainerSAS(
      helper.testaccount,
      'container-test',
      'read-write'
    );

    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');
  });

  test('azureContainerSAS (read-write)', async () => {
    let result = await helper.apiClient.azureContainerSAS(
      helper.testaccount,
      'container-test',
      'read-write',
    );
    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');

    let blob = new azure.Blob({
      accountId: helper.testaccount,
      sas: result.sas,
    });

    result = await blob.putBlob('container-test', 'blobTest', {type: 'BlockBlob'});
    assert(result);
  });

  test('azureContainers', async function() {
    return helper.apiClient.azureContainers(
      helper.testaccount,
    ).then(function(result) {
      assert(result.containers.includes('container-test'));
    });
  });

  test('azureContainerSAS (read-only)', async () => {
    let result = await helper.apiClient.azureContainerSAS(
      helper.testaccount,
      'container-test',
      'read-only',
    );
    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');

    let blob = new azure.Blob({
      accountId: helper.testaccount,
      sas: result.sas,
    });

    try {
      await blob.putBlob('container-test', 'blobTest', {type: 'BlockBlob'});
    } catch (error) {
      assert.equal(error.code, 'AuthorizationPermissionMismatch');
      return;
    }
    assert(false, 'This should have thrown an error because the write is not allowed.');
  });

  test('azureContainerSAS (invalid level)', async () => {
    try {
      await helper.apiClient.azureContainerSAS(
        helper.testaccount,
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
      'auth:azure-container:read-write:' + helper.testaccount + '/allowed-container',
    );

    let result = await helper.apiClient.azureContainerSAS(
      helper.testaccount,
      'allowed-container',
      'read-write'
    );

    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');
  });

  test('azureContainerSAS (allowed read-write -> read-only)', async () => {
    helper.setupScopes(
      'auth:azure-container:read-write:' + helper.testaccount + '/allowed-container',
    );

    let result = await helper.apiClient.azureContainerSAS(
      helper.testaccount,
      'allowed-container',
      'read-only',
    );
    assert(typeof result.sas === 'string', 'Expected some form of string');
    assert(new Date(result.expiry).getTime() > new Date().getTime(),
      'Expected expiry to be in the future');
  });

  test('azureContainerSAS (unauthorized container)', async () => {
    helper.setupScopes(
      'auth:azure-container:read-write:' + helper.testaccount + '/allowed-container',
    );
    try {
      await helper.apiClient.azureContainerSAS(
        helper.testaccount,
        'unauthorized-container',
        'read-write'
      );
    } catch (error) {
      assert(error.statusCode == 403, 'Expected authorization error!');
      return;
    }
    assert(false, 'Expected an authentication error!');
  });
});
