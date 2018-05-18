const assert = require('assert');
const {sasCredentials} = require('..');
const nock = require('nock');
const url  = require('url');
const libUrls = require('taskcluster-lib-urls');

suite('index_test.js', function() {
  let scope;

  const mockAzureTableSAS = (accessLevel) => {
    const rootUrl = libUrls.testRootUrl();
    const azureTableSASPath = url.parse(
      libUrls.api(rootUrl, 'auth', 'v1', `/azure/myaccount/table/mytable/${accessLevel}`)
    ).pathname;
    scope = nock(rootUrl, {encodedQueryParams:true, allowUnmocked: true})
      .get(azureTableSASPath)
      .reply(200, function() {
        return {
          expiry: new Date().toJSON(),
          sas: 'x=10&y=20',
        };
      });
  };

  teardown(function() {
    if (scope) {
      assert(scope.isDone(), 'nock was not accessed');
      scope = null;
    }
  });

  test('fetches credentials', async function() {
    mockAzureTableSAS('read-write');
    const creds = sasCredentials({
      accountId: 'myaccount',
      tableName: 'mytable',
      rootUrl: libUrls.testRootUrl(),
      credentials: {},
    });

    assert.equal(creds.accountId, 'myaccount');
    assert.equal(creds.minSASAuthExpiry, 15 * 60 * 1000);
    assert.equal(await creds.sas(), 'x=10&y=20');
  });

  test('fetches credentials read-only', async function() {
    mockAzureTableSAS('read-only');
    const creds = sasCredentials({
      accountId: 'myaccount',
      tableName: 'mytable',
      rootUrl: libUrls.testRootUrl(),
      credentials: {},
      accessLevel: 'read-only',
    });

    assert.equal(creds.accountId, 'myaccount');
    assert.equal(creds.minSASAuthExpiry, 15 * 60 * 1000);
    assert.equal(await creds.sas(), 'x=10&y=20');
  });
});
