suite('azure table (sas)', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('auth:test:azure');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var azure       = require('fast-azure-storage');
  var taskcluster = require('taskcluster-client');

  test('azureTableSAS', function() {
    return helper.auth.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'read-write'
    ).then(function(result) {
      assert(typeof(result.sas) === 'string', "Expected some form of string");
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
             "Expected expiry to be in the future");
    });
  });

  test('azureTableSAS (read-write)', async function() {
    let res = await helper.auth.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'read-write',
    ).then(function(result) {
      assert(typeof(result.sas) === 'string', "Expected some form of string");
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
             "Expected expiry to be in the future");
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
    let res = await helper.auth.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'read-only',
    ).then(function(result) {
      assert(typeof(result.sas) === 'string', "Expected some form of string");
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
             "Expected expiry to be in the future");
      return result;
    });
    let table = new azure.Table({
      accountId: helper.testaccount,
      sas: res.sas,
    });
    // This should not error since this is read-write
    return table.insertEntity('TestTable', {PartitionKey: taskcluster.slugid(), RowKey: 'c'}).then(() => {
      assert(false, "This should not have been allowed to write!");
    }, (err) => {
      assert.equal(err.code, 'ResourceNotFound', 'This should not be able to see the table at all.');
    });
  });

  test('azureTableSAS (invalid level)', function() {
    return helper.auth.azureTableSAS(
      helper.testaccount,
      'TestTable',
      'foo-bar-baz',
    ).then(function(result) {
      assert(false, "This should have thrown an error");
    }).catch(function(err) {
      assert.equal(err.message, "Level 'foo-bar-baz' is not valid. Must be one of ['read-write', 'read-only'].");
    });
  });

  var rootCredentials = {
    clientId: 'root',
    accessToken: helper.rootAccessToken
  };


  test('azureTableSAS (allowed table)', function() {
    // Restrict access a bit
    var auth = new helper.Auth({
      baseUrl:          helper.baseUrl,
      credentials:      rootCredentials,
      authorizedScopes: [
        'auth:azure-table:read-write:' + helper.testaccount + '/allowedTable'
      ]
    });
    return auth.azureTableSAS(
      helper.testaccount,
      'allowedTable',
      'read-write'
    ).then(function(result) {
      assert(typeof(result.sas) === 'string', "Expected some form of string");
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
             "Expected expiry to be in the future");
    });
  });

  test('azureTableSAS (too high permission)', function() {
    // Restrict access a bit
    var auth = new helper.Auth({
      baseUrl:          helper.baseUrl,
      credentials:      rootCredentials,
      authorizedScopes: [
        'auth:azure-table:read-only:' + helper.testaccount + '/allowedTable'
      ]
    });
    return auth.azureTableSAS(
      helper.testaccount,
      'allowedTable',
      'read-write'
    ).then(function(result) {
      assert(false, "Expected an authentication error!");
    }, function(err) {
      assert(err.statusCode == 403, "Expected authorization error!");
    });
  });

  test('azureTableSAS (unauthorized table)', function() {
    // Restrict access a bit
    var auth = new helper.Auth({
      baseUrl:          helper.baseUrl,
      credentials:      rootCredentials,
      authorizedScopes: [
        'auth:azure-table:read-write:' + helper.testaccount + '/allowedTable'
      ]
    });
    return auth.azureTableSAS(
      helper.testaccount,
      'unauthorizedTable',
      'read-write'
    ).then(function(result) {
      assert(false, "Expected an authentication error!");
    }, function(err) {
      assert(err.statusCode == 403, "Expected authorization error!");
    });
  });
});
